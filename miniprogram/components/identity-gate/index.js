const identity=require('../../utils/identity');
const copy=require('../../utils/identityCopy');
Component({
  data:{busy:false,message:'',labels:copy()},
  lifetimes:{
    attached(){this.off=identity.subscribe(s=>this.setData({busy:s.status==='verifying',labels:copy()}));this.setData({busy:identity.snapshot().status==='verifying',labels:copy()});},
    detached(){if(this.off)this.off();}
  },
  methods:{
    async retry(){
      if(this.data.busy)return;
      this.setData({message:''});
      try{await identity.verify({diagnostic:true});}
      catch(e){this.setData({message:identity.diagnosticMessage(e)});}
      return identity.diagnosticSnapshot();
    }
  }
});
