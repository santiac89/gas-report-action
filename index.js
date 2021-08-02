const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const { parse } = require('node-html-parser');
const tabletojson = require('tabletojson').Tabletojson;

function *map(a, fn) {
    for(let x of a)
        yield fn(x);
}

function find(a, fn) {
    for(let x of a)
        if (fn(x))
            return x;
}

const parseCommentAsRun = comment => {
    const root = parse(comment.body);
    if (!root.querySelector("#report_run_id") || !root.querySelector("#report_table_data") || !root.querySelector("#report_commit")) return null;
    const previousRunId = root.querySelector("#report_run_id").text;
    const previousRunCommit = root.querySelector("#report_commit").text;
    const tableHtml = root.querySelector("#report_table_data").toString();
    const [ previousRunData ] = tabletojson.convert(tableHtml);
    return { id: previousRunId, data: previousRunData, commit: previousRunCommit };
}

const getPreviousResultFromComments = async (context, pull_request, octokit) => {
    let currentPage = 0;
    let lastPage = false;
    let comments = [];
    let lastRun = null;

    while (!lastPage) {
        const response = await octokit.rest.issues.listComments({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: pull_request.number,
            per_page: 100,
            page: currentPage
        });

        comments = response.data;
        comments.sort((a, b) => b.id - a.id);

        const possibleLastRun = find(map(comments, parseCommentAsRun), parsedComment => parsedComment);

        if (possibleLastRun) {
            lastRun = possibleLastRun;
        }

        if (response.data.length < 100) {
            return lastRun;
        }

        currentPage++;
    }

    return;
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
    let htmlOutput = `<h1>Gas usage report - Run No. #<span id="report_run_id">${currentResults.id}</span> </h1>
        <h3>Commit SHA: <span id="report_commit">${currentResults.commit}</span> ${previousResults ? `- Compared to ${previousResults.commit}` : ''}</h3>
        <table id="report_table_data">
            <tr>
                <th>Contract</th>
                <th>Method</th>
                <th>Min</th>
                <th>Max</th>
                <th>Avg</th>
                ${previousResults ? '<th>Avg. Diff.</th>' : ''}
            </tr>
            
    `;

    currentResults.data.forEach((currentResult) => {
        let diff;

        if (previousResults) {
            const previousResult = previousResults.data
                .find(previousResult => previousResult.Contract === currentResult.Contract && previousResult.Method === currentResult.Method);
                
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
                <td>${currentResult.Min}</td>
                <td>${currentResult.Max}</td>
                <td>${currentResult.Avg}</td>
                ${diff ? `<td>${diff.Avg === 0 ? '-' : `${diff.Avg >= 0 ? '🔺' : '🟢'} ${diff.Avg.toFixed(2)} %`}</td>` : ''}
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
        core.setOutput("parsed_gas_report", currentRun);

        if (!github_token) {
            console.log('Missing Github token, skipping comment post.');
            return;
        }

        const octokit = github.getOctokit(github_token);
        
        let pull_request = await getAssociatedPullRequest(context, octokit);
        
        if (!pull_request) {
            return;
        }

        const previousRun = await getPreviousResultFromComments(context, pull_request, octokit);
        
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

