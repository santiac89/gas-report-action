const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const { parse } = require('node-html-parser');
const tabletojson = require('tabletojson').Tabletojson;

const run = async () => {
    try {
        const context = github.context;
        const reportFilePath = core.getInput('report_file');
        const contractsToReport = core.getInput('contracts') == '' ? [] : core.getInput('contracts').split(',');

        const rawReport = fs.readFileSync(reportFilePath);
        const jsonReport = JSON.parse(rawReport);

        let htmlOutput = `<div># Gas usage report - <span id="report_run_id">${context.runId}</span>
            <table id="report_table_data">
                <tr>
                    <th>Contract</th>
                    <th>Method</th>
                    <th>Min</th>
                    <th>Max</th>
                    <th>Average</th>
                </tr>
                
        `;

        Object.keys(jsonReport.info.methods).forEach((key) => {
            if (contractsToReport.length > 0 && !contractsToReport.includes(jsonReport.info.methods[key].contract)) return;
            if (jsonReport.info.methods[key].numberOfCalls === 0) return;
            
            htmlOutput += `
                <tr>
                    <td>${jsonReport.info.methods[key].contract}</td>
                    <td>${jsonReport.info.methods[key].method}</td>
                    <td>${Math.min(...jsonReport.info.methods[key].gasData)}</td>
                    <td>${Math.max(...jsonReport.info.methods[key].gasData)}</td>
                    <td>${Math.round(jsonReport.info.methods[key].gasData.reduce((a,b) => a + b, 0) / jsonReport.info.methods[key].numberOfCalls)}</td>
                </tr>
            `;
        });

        htmlOutput += `</table> </div>`
        htmlOutput = htmlOutput.replace(/(?:\r\n|\r|\n)/g, '');

        core.setOutput("github_comment", htmlOutput);

        const github_token = core.getInput('token');

        if (!github_token) {
            console.log('Missing Github token, skipping comment post.');
            return;
        }

        const octokit = github.getOctokit(github_token);
        
        let pull_request = null;

        try {
            // console.log(context);

            const result = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                commit_sha: context.sha
            });

            pull_request = result.data.length > 0 && result.data.filter(el => el.state === 'open')[0];
        } catch (err) {
            console.log(err)
        }
        
        if (!pull_request) {
            return;
        }
 
        const response = await octokit.rest.issues.listComments({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: pull_request.number,
            per_page: 100
        });

        let comments = response.data;

        comments.sort((a, b) => b.id - a.id);

        let runId;

        comments.some((comment) => {
            const root = parse(comment.body);
                // console.log(root)
            if (!root.querySelector("#report_run_id")) return false;

            runId = root.querySelector("#report_run_id").text;
            const tableHtml = root.querySelector("#report_table_data").toString();
            const previousRun = tabletojson.convert(tableHtml);
            console.log(runId, previousRun);

            return true;
        })
        
        octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: pr.number,
            body: htmlOutput
        });
        

    } catch (error) {
        core.setFailed(error);
    }
}

run();

