const identity=require('../../utils/identity');
const copy=require('../../utils/identityCopy');
function appearance(){try{return {dusk:!!(identity.deviceSettings&&identity.deviceSettings().theme==='dusk')};}catch(e){return {dusk:false};}}
Component({
  data:{busy:false,retryDisabled:false,message:'',labels:copy(identity.snapshot())},
  lifetimes:{
    attached(){
      this.alive=true;const lifetime=this.lifetime=(this.lifetime||0)+1;
      this.off=identity.subscribe(s=>{if(this.alive&&this.lifetime===lifetime)this.setData({...appearance(),busy:s.status==='verifying',retryDisabled:s.status==='verifying'||(s.diagnosisActive&&s.diagnosisAttempted),labels:copy(s)});});
      const s=identity.snapshot();this.setData({...appearance(),busy:s.status==='verifying',retryDisabled:s.status==='verifying'||(s.diagnosisActive&&s.diagnosisAttempted),labels:copy(s)});
    },
    detached(){this.alive=false;this.lifetime=(this.lifetime||0)+1;if(this.off)this.off();}
  },
  methods:{
    async retry(){
      if(this.alive===false || this.data.busy||this.data.retryDisabled)return;
      const lifetime=this.lifetime;
      this.setData({message:''});
      try{await identity.verify({diagnostic:true});}
      catch(e){if(this.alive&&this.lifetime===lifetime)this.setData({message:identity.diagnosticMessage(e)});}
      return identity.diagnosticSnapshot();
    }
  }
});
