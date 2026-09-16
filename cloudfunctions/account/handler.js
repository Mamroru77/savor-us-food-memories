const crypto = require('crypto');
const SAFE_ERRORS = {
  // Finite general/database mappings from the inspected wx-server-sdk 2.4.0.
  '-501001':['SYS_ERR','unknown'], '-501005':['INVALID_ENV','environment'],
  '-501003':['EXCEED_REQUEST_LIMIT','limit'], '-501004':['EXCEED_CONCURRENT_REQUEST_LIMIT','limit'],
  '-501006':['INVALID_COMMON_PARAM','invalid-input'], '-501008':['INVALID_REQUEST_SOURCE','invalid-input'],
  '-501009':['RESOURCE_NOT_INITIAL','environment'], '-502004':['DATABASE_COLLECTION_EXCEED_LIMIT','limit'],
  '-501002':['SERVER_TIMEOUT','timeout'], '-501007':['INVALID_PARAM','invalid-input'],
  '-502001':['DATABASE_REQUEST_FAILED','unknown'], '-502002':['DATABASE_INVALID_OPERATOR','invalid-input'],
  '-502003':['DATABASE_PERMISSION_DENIED','permission'], '-502005':['DATABASE_COLLECTION_NOT_EXIST','not-found'],
  DUPLICATE_KEY:['DUPLICATE_KEY','duplicate'], DATABASE_DUPLICATE_KEY:['DATABASE_DUPLICATE_KEY','duplicate'],
  SERVER_TIMEOUT:['SERVER_TIMEOUT','timeout'], INVALID_PARAM:['INVALID_PARAM','invalid-input'],
  DATABASE_PERMISSION_DENIED:['DATABASE_PERMISSION_DENIED','permission'],
  DATABASE_COLLECTION_NOT_EXIST:['DATABASE_COLLECTION_NOT_EXIST','not-found'],
  INSERT_DOC_FAIL:['INSERT_DOC_FAIL','unknown'], DATABASE_REQUEST_FAILED:['DATABASE_REQUEST_FAILED','unknown']
};
const SAFE_TYPES = new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError']);
function diagnose(write, stage, error, startedAt, fallback='unknown') {
  let key='',type='UnknownError';
  try { key=String(error&&(error.errCode!==undefined?error.errCode:error.code)||'');type=error&&SAFE_TYPES.has(error.name)?error.name:type; } catch (_) {}
  const known=Object.prototype.hasOwnProperty.call(SAFE_ERRORS,key)?SAFE_ERRORS[key]:null;
  const entry={event:'ACCOUNT_DIAGNOSIS',stage,sdkCode:known?known[0]:'UNKNOWN',category:known?known[1]:fallback,
    type,elapsedMs:Math.max(0,Date.now()-startedAt)};
  try { write(entry); } catch (_) {}
}
// Repository is owner-scoped by a server-derived key. A duplicate insert must
// re-read the winner, never replace its randomly assigned product identity.
function createHandler({ context, repository, now = Date.now, randomId = () => crypto.randomBytes(24).toString('hex'), diagnosticLog }) {
  const write=typeof diagnosticLog==='function'?diagnosticLog:entry=>console.error(JSON.stringify(entry));
  return async function bootstrap(event = {}) {
    if (event.action !== 'bootstrap' || event.protocolVersion !== 1) return { success:false, code:'UNSUPPORTED_PROTOCOL' };
    const { OPENID, APPID } = context();
    if (!OPENID || !APPID) return { success:false, code:'IDENTITY_UNAVAILABLE' };
    const startedAt=Date.now();
    // Explicit diagnostics contain only the existing server-side allowlisted fields.
    const diagnostics=[];
    const writeDiagnostic=entry=>{ diagnostics.push(entry);write(entry); };
    const unavailable=()=>Object.assign({success:false,code:'ACCOUNT_UNAVAILABLE'},event.diagnostic===true?{diagnostics}:{});
    let key,account;
    try { key=crypto.createHash('sha256').update(JSON.stringify([APPID,OPENID])).digest('hex'); }
    catch (error) { diagnose(writeDiagnostic,'account-build',error,startedAt);throw error; }
    try { account=await repository.find(key); }
    catch (error) { diagnose(writeDiagnostic,'account-find',error,startedAt);return unavailable(); }
    if (!account) {
      let candidate;
      try { candidate={_id:key,userId:'u_'+randomId(),profileRevision:0,membershipVersion:0,createdAt:now()}; }
      catch (error) { diagnose(writeDiagnostic,'account-build',error,startedAt);return unavailable(); }
      try { await repository.insert(candidate);account=candidate; }
      catch (error) {
        diagnose(writeDiagnostic,'account-insert',error,startedAt);
        try { account=await repository.find(key); }
        catch (readError) { diagnose(writeDiagnostic,'account-reread',readError,startedAt);return unavailable(); }
        if (!account) { diagnose(writeDiagnostic,'account-reread',null,startedAt,'not-found');return unavailable(); }
      }
    }
    try {
      if (!/^u_[a-f0-9]{48}$/.test(account.userId)) return { success:false, code:'ACCOUNT_INVALID' };
      return { success:true, protocolVersion:1, userId:account.userId, profileRevision:account.profileRevision,
        membershipVersion:account.membershipVersion, serverTime:now(), capabilities:['private-cache-v1'] };
    } catch (error) { diagnose(writeDiagnostic,'account-result-check',error,startedAt);return unavailable(); }
  };
}
module.exports = { createHandler };
