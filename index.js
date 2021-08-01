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
            <th>
                <td>Contract</td>
                <td>Method</td>
                <td>Max</td>
                <td>Min</td>
                <td>Average</td>
            </th>
    `;

    Object.keys(jsonReport.info.methods).forEach((key) => {
        if (contractsToReport.length > 0 && !contractsToReport.includes(jsonReport.info.methods[key].contract)) return;
        if (jsonReport.info.methods[key].numberOfCalls === 0) return;
        
        htmlOutput += `
            <tr>
                <td>${jsonReport.info.methods[key].contract}</td>
                <td>${jsonReport.info.methods[key].method}</td>
                <td>${Math.max(...jsonReport.info.methods[key].gasData)}</td>
                <td>${Math.min(...jsonReport.info.methods[key].gasData)}</td>
                <td>${Math.round(jsonReport.info.methods[key].gasData.reduce((a,b) => a + b, 0) / jsonReport.info.methods[key].numberOfCalls)}</td>
            </tr>
        `;
    });

    htmlOutput += `</table>`


    

    core.setOutput("github_comment", htmlOutput);
//   // Get the JSON webhook payload for the event that triggered the workflow
//   const payload = JSON.stringify(github.context.payload, undefined, 2)
//   console.log(`The event payload: ${payload}`);
} catch (error) {
    core.setFailed(error.message);
}