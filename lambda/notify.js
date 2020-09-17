const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const crypto = require('crypto');

const { JWS_SECRET } = process.env;

// from https://github.com/imorente/netlify-form-functions-integration
function signed(event) {
  const signature = event.headers["x-webhook-signature"];
  if (!signature) {
    console.log("Missing x-webhook-signature");
    return false;
  }

  const { iss, sha256 } = jwt.verify(signature, JWS_SECRET);
  const hash = crypto
    .createHash("sha256")
    .update(event.body)
    .digest("hex");

  return iss === "netlify" && sha256 === hash;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  if (!signed(event)) {
    return {
      statusCode: 403,
      body: "Invalid signature"
    };
  }

  const payload = JSON.parse(event.body);
  console.log(payload)

  const token = event.queryStringParameters.token;

  if (token == null) {
    console.log("Missing GitHub token");
    return({statusCode: 403, body: "Invalid GitHub token"})
  }

  const ref = payload["commit_ref"];
  const url = payload["commit_url"];
  const deploy_id = payload["id"];
  const state = payload["state"];

  if (ref == null) {
    console.log("Not triggered by GitHub");
    return({statusCode: 200, body: "Skipped"})
  }

  const urlrx = /^https:\/\/github.com\/(.*?)\/(.*?)\//;
  const matches = urlrx.exec(url);
  const owner = matches[1];
  const repo = matches[2];

  const endpoint = `https://api.github.com/repos/${owner}/${repo}/statuses/${ref}`;

  const target_url = `https://client.uat2.bluescape.com/pr-${deploy_id}/my`

  var reply;

  switch(state) {
    case "ready":
      reply = {state: "success", target_url: target_url, context: "deploy to UAT2"};
      break;
    case "building":
      reply = {state: "pending", target_url: target_url, context: "deploy to UAT2"};
      break;
    case "error":
      reply = {state: "failure", target_url: target_url, context: "deploy to UAT2"};
      break;
    default:
      reply = {state: "error", context: "deploy to UAT2"};
  }

  return fetch(endpoint, {
    headers: {
      "content-type": "application/json",
      "Authorization": `token ${token}`
    },
    method: "POST",
    body: JSON.stringify(reply)
  })
    .then(res => res.text())
    .then(data => {
      return({
        statusCode: 200,
        body: data
      })
    })
    .catch(error => ({
      statusCode: 422,
      body: `Oops! Something went wrong. ${error}`
    }));
}
