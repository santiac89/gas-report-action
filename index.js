const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');

try {
  // `who-to-greet` input defined in action metadata file
  const reportFilePath = core.getInput('report_file');
  const contractsToReport = core.getInput('contracts');

//   
// console.log(`Hello ${nameToGreet}!`);


const rawReport = fs.readFileSync(reportFilePath);

const jsonReport = JSON.parse(rawReport);

const methodsToReport = Object.keys(jsonReport.info.methods).map(key => {
    if (contractsToReport.length === 0 || contractsToReport.includes(jsonReport.info.methods[key].contract)) {
        return jsonReport.info.methods[key];
    }
});


//   const time = (new Date()).toTimeString();
  core.setOutput("github_comment", JSON.stringify(methodsToReport));
//   // Get the JSON webhook payload for the event that triggered the workflow
//   const payload = JSON.stringify(github.context.payload, undefined, 2)
//   console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}