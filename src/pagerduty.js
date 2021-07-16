const core = require('@actions/core');
const { context } = require('@actions/github');
const axios = require('axios');



async function makeAndSendPagerAlert(integrationKey, errorMessage) {
    try {
        let alert = {
            "payload": {
                "summary": `${context.repo.repo}: Error in "${context.workflow}" run by @${context.actor}`,
                "timestamp": new Date().toISOString(),
                "source": 'MULESOFT-DEPLOY-ACTION',
                "severity": 'critical',
                "custom_details": {
                    "run_details": `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
                    "error_message": errorMessage,
                    "related_commits": context.payload.commits
                        ? context.payload.commits.map((commit) => `${commit.message}: ${commit.url}`).join(', ')
                        : 'No related commits',
                },
            },
            "routing_key": integrationKey,
            "event_action": 'trigger'
        };
        sendAlert(alert);
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

async function sendAlert(alert) {
    try {
        const response = await axios.post('https://events.pagerduty.com/v2/enqueue', alert);

        if (response.status === 202) {
            console.log(`Successfully sent PagerDuty alert. Response: ${JSON.stringify(response.data)}`);
        } else {
            core.setFailed(
                `PagerDuty API returned status code ${response.status} - ${JSON.stringify(response.data)}`
            );
        }
    }
    catch (error) {
        core.setFailed(error);
    }
}

module.exports = {
    makeAndSendPagerAlert
}