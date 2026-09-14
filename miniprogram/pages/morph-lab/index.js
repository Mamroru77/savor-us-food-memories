// Developer-only visual acceptance page: no store, records, network or writes.
const pairs=[
  {a:'house',b:'house-heart',label:'回忆 · 未选中 / 选中'},
  {a:'map',b:'map-pinned',label:'地图 · 未选中 / 选中'},
  {a:'utensils',b:'utensils-crossed',label:'添加 · 未选中 / 选中'},
  {a:'users',b:'users-round',label:'我们 · 未选中 / 选中'},
  {a:'user',b:'user-round',label:'我的 · 未选中 / 选中'},
  {a:'plus',b:'x',label:'添加 / 关闭'},
  {a:'chevron-left',b:'chevron-right',label:'标记分页方向'},
  {a:'chevron-up',b:'chevron-down',label:'展开 / 收起'},
  {a:'sliders-horizontal',b:'x',label:'筛选 / 关闭（仅试验）'},
  {a:'check',b:'circle-check',label:'选中 / 完成'},
  {a:'bookmark',b:'bookmark-check',label:'收藏状态'},
  {a:'heart',b:'star',label:'喜欢 / 星形（仅几何试验）'},
  {a:'plus',b:'minus',label:'加 / 减'},
  {a:'loader-circle',b:'circle-check',label:'处理 / 完成（仅几何试验）'}
];
Page({
  data:{pairs,index:0,name:pairs[0].a,quiet:false,dark:false,reports:[],exportText:'',status:'等待 Canvas 初始化'},
  onPick(e){clearTimeout(this.reverseTimer);const index=Number(e.currentTarget.dataset.index);this.setData({index,name:pairs[index].a});},
  onToggle(){const p=pairs[this.data.index];this.setData({name:this.data.name===p.a?p.b:p.a});},
  onReverse(){clearTimeout(this.reverseTimer);this.onToggle();this.reverseTimer=setTimeout(()=>{this.reverseTimer=null;this.onToggle();},120);},
  onQuiet(){this.setData({quiet:!this.data.quiet});},
  onDark(){this.setData({dark:!this.data.dark});},
  onReport(e){const r=e.detail||{};const reports=this.data.reports.concat([r]).slice(-50);this.setData({reports,status:JSON.stringify(r)});},
  onExport(){this.setData({exportText:JSON.stringify({scope:'native-canvas-morph-lab',quiet:this.data.quiet,reports:this.data.reports},null,2)});},
  onHide(){clearTimeout(this.reverseTimer);this.reverseTimer=null;},
  onUnload(){this.onHide();}
});
