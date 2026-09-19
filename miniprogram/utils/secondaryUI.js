// Presentation only: no account verification, mutations, persistence or navigation.
const i18n=require('./i18n');
const feedback=require('./uiFeedback');
const rows={
 emptyTasks:['还没有云端任务。','No cloud tasks yet.'],emptyJobs:['还没有反馈或提醒记录。','No feedback or reminder records yet.'],
 emptyWishes:['还没有心愿，慢慢收集想一起去的地方。','No wishes yet. Collect places you would like to visit together.'],emptyMeals:['还没有共同记录。','No shared memories yet.'],
 reportTitle:['年度报告与里程碑','Your year & milestones'],
 reportIntro:['仅统计当前账号本机真实日记；不读取伴侣资料。排除示例、删除、待删除和未来记录。未同步的其他设备记录不会自动出现。','Based only on real diary entries stored on this device for the current account. Partner data, examples, deleted, pending-deletion and future entries are excluded. Unsynced entries on other devices are not included.'],
 chooseYear:['选择年份','Choose a year'],meals:['餐记录','meal records'],asOf:['截至','As of'],days:['个记录日','recording days'],places:['个可确认地点','confirmed places'],streak:['最长连续','Longest streak'],dayUnit:['天','days'],
 unknown:['条未知地点不计入地点数。','unknown locations excluded from the place count.'],rated:['单评分样本','Single-rating entries'],noEstimates:['条；不推算双人评分或总消费。','; no estimates of joint ratings or total spending.'],milestone:['累计餐次','Meal milestone'],slow:['慢慢记录，不必赶进度。','Keep your memories at your own pace.'],
 shareScope:['主动选择分享范围','Choose what to share'],shareIntro:['海报固定只含汇总。HTML 默认仅汇总；启用下面的选项才包含餐厅、日期与已确认城市。不包含姓名、笔记和照片。','The poster contains summaries only. HTML also defaults to summaries; enable the option below to include restaurants, dates and confirmed cities. Names, notes and photos are excluded.'],
 includeDetails:['HTML 加入餐厅与已确认城市','Include restaurants and confirmed cities in HTML'],exportHtml:['导出 / 分享 HTML 报告','Export / share HTML report'],sharePoster:['预览 / 分享仅汇总海报','Preview / share summary poster'],irreversible:['分享后无法撤回对方保存的副本。','Copies saved by recipients cannot be recalled.'],
 exportTitle:['导出年度报告','Export annual report'],exportDetailConsent:['包含日期、餐厅和已确认城市，不含笔记/照片。分享后无法撤回副本。确认继续？','Include dates, restaurants and confirmed cities, but no notes or photos. Shared copies cannot be recalled. Continue?'],exportSummaryConsent:['仅导出汇总与里程碑日期，不含姓名、餐厅、笔记或照片。分享后无法撤回副本。','Export summaries and milestone dates only; no names, restaurants, notes or photos. Shared copies cannot be recalled.'],
 posterShared:['海报仅含汇总。分享后无法撤回对方保存的副本。','The poster contains summaries only. Copies saved by recipients cannot be recalled.'],posterUnavailable:['海报暂不可用，请导出 HTML 报告。','The poster is unavailable. Please export the HTML report.']
};
function copy(report){const index=i18n.locale()==='zh-CN'?0:1;const text={};Object.keys(rows).forEach(k=>text[k]=rows[k][index]);
 if(index===1&&report){
  if(report.count===1)text.meals='meal record';
  if(report.days===1)text.days='recording day';
  if(report.places===1)text.places='confirmed place';
  if(report.longestStreak===1)text.dayUnit='day';
  if(report.unknownLocations===1)text.unknown='unknown location excluded from the place count.';
  text.rated=report.ratedCount===1?'Single-rating entry:':'Single-rating entries:';
  text.noEstimates='— no estimates of joint ratings or total spending.';
 }
 return text;
}
function sync(page,navigationTitle){let dusk=false;try{dusk=require('./store').get().settings.theme==='dusk';}catch(e){}
 page.setData({dusk,locale:i18n.locale(),uiText:copy()});
 try{if(navigationTitle&&wx.setNavigationBarTitle)wx.setNavigationBarTitle({title:i18n.t(navigationTitle)});}catch(e){}
 try{if(wx.setNavigationBarColor)wx.setNavigationBarColor({frontColor:dusk?'#ffffff':'#000000',backgroundColor:dusk?'#121315':'#eeece9'});}catch(e){}
}
module.exports={copy,sync,onFieldFocus:feedback.onFieldFocus,onFieldBlur:feedback.onFieldBlur};
