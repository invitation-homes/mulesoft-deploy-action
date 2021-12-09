const core = require('@actions/core');
const github = require('@actions/github')
const axios = require('axios');
const FormData = require('form-data');
const pager = require('./pagerduty');
var streamLength = require("stream-length");

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
	//await postDeploymentDetails(cloudhub_env,cloudhub_app_name,is_successful,release_tag,commitSHA,context);
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

    try {
        let { headers, status } = await octokit.request("HEAD /repos/{owner}/{repo}/releases/assets/{asset_id}", {
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
        console.log("headers: %j", headers);
        let result = null;
        /*
        result = (await octokit.request("GET /repos/{owner}/{repo}/releases/assets/{asset_id}", {
            headers: {
                Accept: "application/octet-stream",
            },
            ...context.repo,
            asset_id: assetId
        }));*/
        
        result =  (await axios({
            method: "get",
            url: headers.location,
            headers: {
                "Accept": "application/octet-stream",
            },
        }));

        console.log("result 0:  %j", result);
        console.log("result 1: " + result);
        console.log("status:" + result.status);
        console.log("statusText:" + result.statusText);
        console.log("headers:  %j", result.headers);
        console.log("Content length 1:" + result.headers["content-length"]);
        //console.log("Content length 2:" + result.headers.content-length);
        console.log("byteLength: " + result.data.byteLength);
        console.log("length: " + result.data.length);
        console.log("data type: " + typeof(result.data));
        //console.log("data: " + result.data);
        //console.log("Stream length: %j", streamLength(result.data.length));
        const buff = Buffer.from(result.data);
        console.log("buffer length 8: " + buff.length);
        console.log("buffer type 8: " + typeof(buff));

        const buff_16 = Buffer.from(result.data, "utf16le");
        console.log("buffer length 16: " + buff_16.length);
        console.log("buffer type 16: " + typeof(buff_16));

        const buff_bn = Buffer.from(result.data, "binary");
        console.log("buffer length 16: " + buff_bn.length);
        console.log("buffer type 16: " + typeof(buff_bn));

        const ab = toArrayBuffer(result.data);
        console.log("Array Buffer Length: " + ab.byteLength);
        console.log("Array Buffer type: " + typeof(ab));
     
        return toBuffer(ab, ab.byteLength);
    }
    catch (error) {
        logError(error);
    }
}

function toArrayBuffer(binary) {

    var binLen, buffer, chars, i, _i;
    binLen = binary.length;
    buffer = new ArrayBuffer(binLen);
    chars  = new Uint16Array(buffer);
    for (i = _i = 0; 0 <= binLen ? _i < binLen : _i > binLen; i = 0 <= binLen ? ++_i : --_i) {
        chars[i] = String.prototype.charCodeAt.call(binary, i);
    }
    return chars.buffer;
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
            url: `https://api.invitationhomes.com/ci-cd/v1/deployments`,
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
		logError(error, false);
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

function toBuffer(value, size) {
    var buf = Buffer.alloc(size);
    var view = new Uint8Array(value);
    for (var i = 0; i < buf.length; ++i) {
        buf[i] = view[i];
    }
    return buf;
}

function toBuffer_another(value, size) {
    var buf = Buffer.alloc(size);
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
