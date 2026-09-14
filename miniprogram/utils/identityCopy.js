const i18n=require('./i18n');
const rows={
 title:['账号与旧数据','Account & legacy data'],verify:['请先验证当前账号','Verify your account first'],
 gate:['日记、照片和草稿已保留。联网确认身份后，只打开当前账号的私人分区；旧数据不会自动上传。','Your diary, photos and drafts are retained. Connect to verify your account and unlock its private partition. Legacy data is never uploaded automatically.'],
 retry:['联网验证 / 重试','Verify / Retry'],busy:['正在验证…','Verifying…'],failed:['验证暂未完成。请检查网络及云函数部署，原数据不会删除。','Verification failed. Check the network and deployed cloud functions. Your data has not been deleted.'],
 partition:['当前私人分区','Current private partition'],intro:['旧数据归属尚未确认，不会自动发送旧队列。你可返回原账号，或显式导出与复制。复制不带云记录身份、共享关系、照片或历史操作，不会上传。','Legacy ownership is unverified. Old operations are never replayed automatically. Return to the original account, or explicitly export/copy your data. Copies are local and exclude cloud identities, sharing, photos and past operations.'],
 backup:['导出当前账号完整本机备份','Export this private partition'],profile:['仅复制旧昵称与简介到本机','Copy legacy nickname and bio locally'],inspect:['只读核验旧操作','Check legacy operations (read-only)'],raw:['导出隔离区原始备份','Export raw quarantined data'],memories:['复制为当前账号的本机私人记录','Copy as local private memories'],draft:['复制文字为新的私人草稿','Copy text into a new private draft'],
 confirm:['确认旧数据属于你？','Does this legacy data belong to you?'],consent:['仅在你确认有权访问这些数据时继续。原数据会保留；复制不上传、不复制照片、共享关系或重试身份。记录按来源 ID 去重。','Continue only if you have the right to access this data. Originals are retained. Copies are not uploaded and exclude photos, sharing and retry identities. Records are deduplicated by source ID.'],
 done:['已完成本机复制。','Local copy completed.'],report:['confirmed=服务端已确认；owned-needs-review=本人记录但操作未确认；unresolved=归属或结果未知。以上操作均未重放。','confirmed: server confirmed; owned-needs-review: your record, operation unconfirmed; unresolved: ownership or outcome unknown. No operations were replayed.'],
 exportTitle:['导出敏感备份','Export sensitive backup'],exportConsent:['备份可能包含私人记录、草稿、待同步操作和照片引用。仅确认属于你时导出，勿公开分享；不要用其他账号自动重放操作。','Backups may contain private records, drafts, pending operations and photo references. Export only your own data, keep it private, and never replay its operations under another account.'],saved:['备份已写入本机文件。','Backup saved to a local file.']
};
module.exports=function(){const index=i18n.locale()==='zh-CN'?0:1;return Object.fromEntries(Object.keys(rows).map(k=>[k,rows[k][index]]));};
