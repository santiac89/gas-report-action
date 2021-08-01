const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

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

    const github_token = core.getInput('github_token');

    const context = github.context;
    
    if (context.payload.pull_request == null) {
        return;
    }

    const pull_request_number = context.payload.pull_request.number;

    const octokit = new github.GitHub(github_token);
    const new_comment = octokit.issues.createComment({
        ...context.repo,
        issue_number: pull_request_number,
        body: htmlOutput
      });
    

} catch (error) {
    core.setFailed(error.message);
}