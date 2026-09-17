// Reuse only the submission key assigned to this app; never log key material.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const project = 'cc29573d-d20c-4c3b-a7d6-1bc74838127a';
const query = `query MacSubmissionCredentials($appId: String!) { app { byId(appId: $appId) { id ownerAccount { appStoreConnectApiKeysPaginated(first: 50) { edges { node { id keyIdentifier issuerIdentifier appleTeam { appleTeamIdentifier } } } } } iosAppCredentials { appleAppIdentifier { bundleIdentifier } appleTeam { appleTeamIdentifier } appStoreConnectApiKeyForSubmissions { keyIdentifier issuerIdentifier keyP8 } } } } }`;
const res = await fetch('https://api.expo.dev/graphql', {method:'POST',headers:{Authorization:`Bearer ${process.env.EXPO_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{appId:project}})});
const payload = await res.json();
if (!res.ok || payload.errors) throw new Error('Unable to read this app’s existing submission credentials from EAS.');
const matches = payload.data?.app?.byId?.iosAppCredentials?.filter(c=>c.appleAppIdentifier?.bundleIdentifier==='com.tangrenribao.iosapp' && c.appleTeam?.appleTeamIdentifier==='ZJ2LNXPXH3');
let key = matches?.map(c=>c.appStoreConnectApiKeyForSubmissions).find(k=>k?.issuerIdentifier);
if (!key) {
  const candidates = payload.data?.app?.byId?.ownerAccount?.appStoreConnectApiKeysPaginated?.edges?.map(e=>e.node).filter(k=>k.issuerIdentifier==='8447d05f-b28c-4c69-95c4-9cfc13763c78' && k.keyIdentifier==='3BVXT49N5A') ?? [];
  console.log("Signing key metadata", payload.data?.app?.byId?.ownerAccount?.appStoreConnectApiKeysPaginated?.edges?.map(e=>({keyId:e.node.keyIdentifier,hasIssuer:!!e.node.issuerIdentifier,team:e.node.appleTeam?.appleTeamIdentifier ?? null})));
  console.log(`App-assigned team key: absent; matching team keys: ${candidates.length}`);
  if (candidates.length === 1) {
    const reply = await fetch('https://api.expo.dev/graphql',{method:'POST',headers:{Authorization:`Bearer ${process.env.EXPO_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:'query MacTeamKey($id: ID!) { appStoreConnectApiKey { byId(id: $id) { keyIdentifier issuerIdentifier keyP8 } } }',variables:{id:candidates[0].id}})});
    const result = await reply.json();
    if (!reply.ok || result.errors) throw new Error('Unable to access the existing Apple team signing key.');
    key = result.data.appStoreConnectApiKey.byId;
  }
}
if (!key?.keyP8 || !key.issuerIdentifier) throw new Error('Mac automatic signing requires a team App Store Connect key. The app has no reusable team key.');
const base = path.join(process.env.RUNNER_TEMP,'tang-mac-auth');fs.mkdirSync(base,{recursive:true,mode:0o700});
const keyPath = path.join(base,`AuthKey_${key.keyIdentifier}.p8`);fs.writeFileSync(keyPath,key.keyP8,{mode:0o600});
const b64 = x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);const head=b64({alg:'ES256',kid:key.keyIdentifier,typ:'JWT'});const body=b64({iss:key.issuerIdentifier,iat:now,exp:now+300,aud:'appstoreconnect-v1'});
const unsigned=`${head}.${body}`;const token=`${unsigned}.${crypto.sign('sha256',Buffer.from(unsigned),{key:key.keyP8,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;
const check=await fetch('https://api.appstoreconnect.apple.com/v1/certificates?limit=1',{headers:{Authorization:`Bearer ${token}`}});
if(!check.ok)throw new Error(`Existing submission key cannot manage Mac signing certificates (HTTP ${check.status}).`);
fs.appendFileSync(process.env.GITHUB_ENV,`ASC_KEY_PATH=${keyPath}\nASC_KEY_ID=${key.keyIdentifier}\nASC_ISSUER_ID=${key.issuerIdentifier}\n`);
console.log('Existing app-scoped submission key verified for signing access.');
