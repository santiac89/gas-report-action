const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

const run = async () => {
    try {
        const reportFilePath = core.getInput('report_file');
        let contractsToReport = core.getInput('contracts');

        if (contractsToReport === '') {
            contractsToReport = []
        } else {
            contractsToReport = contractsToReport.split(',');
        }

        const rawReport = fs.readFileSync(reportFilePath);

        const jsonReport = JSON.parse(rawReport);


        let htmlOutput = `<table>
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

        htmlOutput += `</table>`
        htmlOutput = htmlOutput.replace(/(?:\r\n|\r|\n)/g, '');

        core.setOutput("github_comment", htmlOutput);




        const github_token = core.getInput('token');

        if (!github_token) {
            console.log('NO TOKEN')
            return;
        }

        const octokit = github.getOctokit(github_token);
        const context = github.context;
        
        let pr = null;

        try {
            console.log(context)
            const result = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                commit_sha: context.sha
            });

            pr = result.data.length > 0 && result.data.filter(el => el.state === 'open')[0];
        } catch (err) {
            console.log(err)
        }
        
        if (!pr) {
            return;
        }
        
        let workflow; 
        try {
            workflow = await octokit.rest.actions.getWorkflowRun({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                run_id: context.runId,
            });

            console.log("WORKFLOW", workflow)

        } catch (err) {
            console.log(1, error)
        }

        let runs = null;
        try {
            
            runs = await octokit.rest.actions.listWorkflowRuns({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                workflow_id: workflow.data.workflow_id,
                status: "success"
            });
        } catch (error) {
            console.log(2, error)
        }

        console.log(runs.data.workflow_runs);

        // octokit.rest.issues.createComment({
        //     ...context.repo,
        //     issue_number: pr.number,
        //     body: htmlOutput
        // });
        

    } catch (error) {
        core.setFailed(error);
    }
}

run();