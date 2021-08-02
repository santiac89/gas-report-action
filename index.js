const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const { parse } = require('node-html-parser');
const tabletojson = require('tabletojson').Tabletojson;

const getPreviousResults = async (context, pull_request, octokit) => {
    const response = await octokit.rest.issues.listComments({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        issue_number: pull_request.number,
        per_page: 100
    });

    let comments = response.data;

    comments.sort((a, b) => b.id - a.id);

    let previousRunId;
    let previousRunData = [];
    let previousRunCommit;

    comments.some((comment) => {
        const root = parse(comment.body);
        if (!root.querySelector("#report_run_id") || !root.querySelector("#report_table_data") || !root.querySelector("#report_commit")) return false;
        previousRunId = root.querySelector("#report_run_id").text;
        previousRunCommit = root.querySelector("#report_commit").text;
        const tableHtml = root.querySelector("#report_table_data").toString();
        [ previousRunData ] = tabletojson.convert(tableHtml);
        return true;
    });


    return { id: previousRunId, data: previousRunData, commit: previousRunCommit };
}

const getAssociatedPullRequest = async (context, octokit) => {
    let pull_request = null;

    try {
        const result = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            commit_sha: context.sha
        });

        pull_request = result.data.length > 0 && result.data.filter(el => el.state === 'open')[0];
    } catch (err) {
        console.log(err)
    }

    return pull_request;
}

const getCurrentResults = (context, filePath, contractsToReport) => {
    const rawReport = fs.readFileSync(filePath);
    const jsonReport = JSON.parse(rawReport);

    const currentRunData = Object.keys(jsonReport.info.methods).reduce((acc, key) => {
        if (contractsToReport.length > 0 && !contractsToReport.includes(jsonReport.info.methods[key].contract)) return acc;
        if (jsonReport.info.methods[key].numberOfCalls === 0) return acc;
        
        acc.push({
            Contract: jsonReport.info.methods[key].contract, 
            Method: jsonReport.info.methods[key].method,
            Min: Math.min(...jsonReport.info.methods[key].gasData),
            Max: Math.max(...jsonReport.info.methods[key].gasData),
            Avg: Math.round(jsonReport.info.methods[key].gasData.reduce((a,b) => a + b, 0) / jsonReport.info.methods[key].numberOfCalls)
        });

        return acc;
    }, []);

    return { id: context.runId, data: currentRunData, commit: context.sha };
}

const generateHtmlComment = (currentResults, previousResults) => {
    let htmlOutput = `<h1>Gas usage report - Run No. #<span id="report_run_id">${currentResults.runId}</span> </h1>
        <h3>Commit SHA: <span id="report_commit">${currentResults.commit}</span></h3>
        ${previousResults.commit ? `<h3>Compared to ${previousResults.commit}</h3>` : ''}
        <table id="report_table_data">
            <tr>
                <th>Contract</th>
                <th>Method</th>
                <th>Min</th>
                <th>Max</th>
                <th>Avg</th>
            </tr>
            
    `;

    currentResults.data.forEach((currentResult) => {
        const previousResult = previousResults.data.find(previousResult => previousResult.Contract === currentResult.Contract && previousResult.Method === currentResult.Method);

        let diff;

        if (previousResult) {
            diff = {
                Min: (currentResult.Min * 100 / previousResult.Min) - 100,
                Max: (currentResult.Max * 100 / previousResult.Max) - 100,
                Avg: (currentResult.Avg * 100 / previousResult.Avg) - 100
            }
        }

        htmlOutput += `
            <tr>
                <td>${currentResult.Contract}</td>
                <td>${currentResult.Method}</td> 
                <td>${currentResult.Min}</td> ${diff ? `<td style="color: ${diff.Min > 0 ? 'red' : 'green'};">${diff.Min}%</td>` : ''}
                <td>${currentResult.Max}</td>  ${diff ? `<td style="color: ${diff.Max > 0 ? 'red' : 'green'};">${diff.Max}%</td>` : ''} 
                <td>${currentResult.Avg}</td>   ${diff ? `<td style="color: ${diff.Avg > 0 ? 'red' : 'green'};">${diff.Avg}%</td>` : ''}
            </tr>
        `;
    });

    htmlOutput += `</table> </div>`
    htmlOutput = htmlOutput.replace(/(?:\r\n|\r|\n)/g, '');

    return htmlOutput;
}


const run = async () => {
    try {
        const context = github.context;
        const github_token = core.getInput('token');
        const reportFilePath = core.getInput('report_file');
        const contractsToReport = core.getInput('contracts') == '' ? [] : core.getInput('contracts').split(',');

        const currentRun = getCurrentResults(context, reportFilePath, contractsToReport);
        core.setOutput("json_gas_report", currentRun);

        if (!github_token) {
            console.log('Missing Github token, skipping comment post.');
            return;
        }

        const octokit = github.getOctokit(github_token);
        
        let pull_request = await getAssociatedPullRequest(context, octokit);
        
        if (!pull_request) {
            return;
        }

        const previousRun = await getPreviousResults(context, octokit);
        
        const commentHtml = generateHtmlComment(currentRun, previousRun);

        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: pull_request.number,
            body: commentHtml
        });
        

    } catch (error) {
        core.setFailed(error);
    }
}

run();

