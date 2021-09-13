const core = require('@actions/core');
const github = require('@actions/github')
const axios = require('axios');
const FormData = require('form-data');
const pager = require('./pagerduty');

const ORG = {
    ID: "5d528c97-b639-428c-bd03-bf3b247075c9"
}

async function main() {

    const release_tag = core.getInput('release-tag');
    const cloudhub_env = core.getInput('cloudhub-env');
    const cloudhub_app_name = core.getInput('cloudhub-app-name');
    if (!release_tag || !cloudhub_env || !cloudhub_app_name) {
        logError("Insufficient/missing arguments...");
        return;
    }

    let cloudhub_org_id = core.getInput('cloudhub-org-id');
    if (!cloudhub_org_id)
        cloudhub_org_id = ORG.ID;

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const CLOUDHUB_USER = process.env.CLOUDHUB_USER;
    const CLOUDHUB_PASSWORD = process.env.CLOUDHUB_PASSWORD;
    const octokit = github.getOctokit(GITHUB_TOKEN);
    const { context = {} } = github;

	var is_successful = false;
	var commitSHA = "";

    try {
        const release = await getRelease(octokit, context, release_tag);
        const { id, name } = release.assets.filter(asset => asset.name.includes(release_tag))[0];
		commitSHA = await getCommitSHA(octokit, context, release_tag);
        const artifact = await getReleaseAsset(octokit, context, id);		
        await uploadToCloudHub(cloudhub_org_id, cloudhub_env, cloudhub_app_name, artifact, name, CLOUDHUB_USER, CLOUDHUB_PASSWORD);		
		is_successful = true;
		console.log("action executed successfully.");
    }
    catch (error) {
        logError(error);
    }	
	
	console.log("sending deployment details to event bridge.");
	await postDeploymentDetails(cloudhub_env,cloudhub_app_name,is_successful,release_tag,commitSHA,context);
	return is_successful;
}

main();


async function getRelease(octokit, context, release_tag) {
    try {
        return (await octokit.repos.getReleaseByTag({
            ...context.repo,
            tag: release_tag
        })).data;
    }
    catch (error) {
        logError(error);
    }
}

async function getCommitSHA(octokit, context, release_tag) {
    try {
        return (await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", {
            headers: {
                Accept: "application/vnd.github.VERSION.sha",
            },
            ...context.repo,
            ref: `tags/${release_tag}`
        })).data;
    }
    catch (error) {
        logError(error);
    }
}

async function getReleaseAsset(octokit, context, assetId) {
    let result = null;
    try {
        result = (await octokit.request("GET /repos/{owner}/{repo}/releases/assets/{asset_id}", {
            headers: {
                Accept: "application/octet-stream",
            },
            ...context.repo,
            asset_id: assetId
        }));
        return toBuffer(result.data);
    }
    catch (error) {
        logError(error);
    }
}

async function uploadToCloudHub(cloudhub_org_id, cloudhub_env, cloudhub_app_name, artifact, artifact_name, cloudhub_user, cloudhub_password) {
    try {
        const environments = await getEnvByOrgId(cloudhub_user, cloudhub_password, cloudhub_org_id);
        const env = environments.filter(e => e.name.toUpperCase() == cloudhub_env.toUpperCase());
        if (env) {
            var form_data = new FormData();
            form_data.append('file', artifact, artifact_name);

            await axios({
                method: "post",
                url: `https://anypoint.mulesoft.com/cloudhub/api/v2/applications/${cloudhub_app_name}/files`,
                auth: { username: cloudhub_user, password: cloudhub_password },
                data: form_data,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    ...form_data.getHeaders(),
                    "Content-Length": form_data.getLengthSync(),
                    'X-ANYPNT-ENV-ID': env[0].id
                }
            })
                .then(() => {
                    console.log(env[0].id + " updated successfully.");
                }, (error) => {
                    logError(error);
                })
        }
    }
    catch (error) {
        logError(error);		
    }
}

async function postDeploymentDetails(cloudhub_env, cloudhub_app_name, is_successful, versionId, commitSHA, context){
	try {		
		const response = await axios({
            method: "post",
            url: `https://api-dev.invitationhomes.com/ci-cd/v1/deployments`,
            headers: {
                'Authorization': `Bearer ${process.env.CI_CD_API_TOKEN}`
            },
            data: { 
                "version": versionId, 
                "commit": commitSHA, 
                "repository": context.repo.repo, 
                "environment": cloudhub_env, 
                "isSuccessful": is_successful, 
                "timestamp": new Date().toISOString()
            }
        })
        return response.data;		
	} 
	catch (error) {
		logError(error);
	}
}

async function getEnvByOrgId(cloudhub_user, cloudhub_password, org_id) {
    try {
        const response = await axios({
            method: "get",
            url: `https://anypoint.mulesoft.com/accounts/api/organizations/${org_id}/environments`,
            auth: { username: cloudhub_user, password: cloudhub_password }
        })
        return response.data.data;
    }
    catch (error) {
        logError(error);
    }
}

function toBuffer(value) {
    var buf = Buffer.alloc(value.byteLength);
    var view = new Uint8Array(value);
    for (var i = 0; i < buf.length; ++i) {
        buf[i] = view[i];
    }
    return buf;
}

function logError(error) {
    core.setFailed(error.message);
    console.error(error);
    const PAGERDUTY_INTEGRATION_KEY = process.env.PAGERDUTY_INTEGRATION_KEY;
    if (PAGERDUTY_INTEGRATION_KEY) {
        pager.makeAndSendPagerAlert(PAGERDUTY_INTEGRATION_KEY, error);
    }
}
