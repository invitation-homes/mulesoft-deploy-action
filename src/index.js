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
    const MULESOFT_CONNECTED_APP_ID = process.env.MULESOFT_CONNECTED_APP_ID;
    const MULESOFT_CONNECTED_APP_SECRET = process.env.MULESOFT_CONNECTED_APP_SECRET;
    const octokit = github.getOctokit(GITHUB_TOKEN);
    const { context = {} } = github;

	var is_successful = false;
	var commitSHA = "";

    try {
        const accesstoken = await getAccessToken(MULESOFT_CONNECTED_APP_ID,MULESOFT_CONNECTED_APP_SECRET);
        const release = await getRelease(octokit, context, release_tag);
        const { id, name } = release.assets.filter(asset => asset.name.includes(release_tag))[0];
		commitSHA = await getCommitSHA(octokit, context, release_tag);
        const artifact = await getReleaseAsset_manually(octokit, context, id);	
        await uploadToCloudHub(cloudhub_org_id, cloudhub_env, cloudhub_app_name, artifact, name, MULESOFT_CONNECTED_APP_ID, MULESOFT_CONNECTED_APP_SECRET,accesstoken);		
		is_successful = true;
		console.log("action executed successfully.");
    }
    catch (error) {
        logError(error);
    }	
	
	console.log("sending deployment details to event bridge.");

	return is_successful;
}

main();

async function getAccessToken(MULESOFT_CONNECTED_APP_ID, MULESOFT_CONNECTED_APP_SECRET) {
    try {
        const response = await axios({
            method: "post",
            url: `https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token`,
            data: {
                "client_id" : MULESOFT_CONNECTED_APP_ID,
                "client_secret": MULESOFT_CONNECTED_APP_SECRET,
                "grant_type" : "client_credentials"
            }
        })
        return response.data.access_token;
    }
    catch (error) {
        logError(error);
    }
}

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

async function getReleaseAsset_manually(octokit, context, assetId) {

    try {
        console.log("Sending Github request to get asset download URL.");
        let { headers, status, url } = await octokit.request("HEAD /repos/{owner}/{repo}/releases/assets/{asset_id}", {
                headers: {
                    Accept: "application/octet-stream",
                },
                ...context.repo,
                asset_id: assetId,
                request: {
                    redirect: "manual"
                }
            }
        );
        console.log("Request URL: " + url);
        console.log("Response Status: " + status);
        console.log("Redirect URL: " + headers.location);
        
        console.log("Sending Github request to download the asset.");
        const result =  (await axios({
            responseType: 'arraybuffer',
            method: "get",
            url: headers.location
        }));
        console.log("Response Status: " + result.status);
        console.log("Byte Length: " + result.data.byteLength);
        return toBuffer(result.data);
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

async function uploadToCloudHub(cloudhub_org_id, cloudhub_env, cloudhub_app_name, artifact, artifact_name, MULESOFT_CONNECTED_APP_ID, MULESOFT_CONNECTED_APP_SECRET ,accesstoken) {
    try {
        const environments = await getEnvByOrgId(MULESOFT_CONNECTED_APP_ID, MULESOFT_CONNECTED_APP_SECRET, cloudhub_org_id, accesstoken);
        const env = environments.filter(e => e.name.toUpperCase() == cloudhub_env.toUpperCase());
        if (env) {
            var form_data = new FormData();
            form_data.append('file', artifact, artifact_name);

            await axios({
                method: "post",
                url: `https://anypoint.mulesoft.com/cloudhub/api/v2/applications/${cloudhub_app_name}/files`,
                data: form_data,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: {
                    ...form_data.getHeaders(),
                    "Content-Length": form_data.getLengthSync(),
                    'X-ANYPNT-ENV-ID': env[0].id,
                    Authorization: "Bearer "+accesstoken,
                    client_id: MULESOFT_CONNECTED_APP_ID,
                    client_secret: MULESOFT_CONNECTED_APP_SECRET
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

async function getEnvByOrgId(MULESOFT_CONNECTED_APP_ID, MULESOFT_CONNECTED_APP_SECRET, org_id, accesstoken) {
    try {
        const response = await axios({
            method: "get",
            url: `https://anypoint.mulesoft.com/accounts/api/organizations/${org_id}/environments`,
            headers: {
                Authorization: "Bearer "+accesstoken,
                client_id: MULESOFT_CONNECTED_APP_ID,
                client_secret: MULESOFT_CONNECTED_APP_SECRET
            }
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

function logError(error, failWorkflow = true) {
    if (failWorkflow == true) {
        core.setFailed(error.message);      
    } 
    console.error(error);
    const PAGERDUTY_INTEGRATION_KEY = process.env.PAGERDUTY_INTEGRATION_KEY;
    if (PAGERDUTY_INTEGRATION_KEY) {
        pager.makeAndSendPagerAlert(PAGERDUTY_INTEGRATION_KEY, error);
    }
}
