// Test-only normal-mode fixture. Never loaded by miniprogram production sources.
const file=require.resolve('../../miniprogram/utils/runtimeConfig');
const shipped=require(file);
require.cache[file].exports=Object.freeze({...shipped,identityMode:'normal'});
