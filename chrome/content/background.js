
var OnLoadObserve=function(){
    browser.udf_bgrndAPI.onloadObserver();
 }
 var Onload= function(){ browser.udf_bgrndAPI.OnLoad();}

 OnLoadObserve();
 browser.runtime.onInstalled.addListener(Onload);
