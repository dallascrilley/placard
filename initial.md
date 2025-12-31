
Task: create meta ads MCP which allows user to authenticate and grant access to their ad account. MCP can programatically create and manage meta ads.


Auth can be set up via meta.realnewspr.com
Use cloud flare access token via 1p to add zone
Use hetzner server (any) for simple oauth flow


https://developers.facebook.com/apps/2269107970176178/business-login/configurations/?business_id=1024085620943315
Configuration id: 869972255619372

User id: 10166053140814478
app ID: 2269107970176178
business ID: 1024085620943315

https://developers.facebook.com/tools/explorer/2269107970176178/

2. Set Up the Facebook SDK for Javascript

The Facebook SDK for JavaScript doesn't have any standalone files that need to be downloaded or installed, instead you simply need to include a short piece of regular JavaScript in your HTML that will asynchronously load the SDK into your pages. The async load means that it does not block loading other elements of your page.

<script>
  window.fbAsyncInit = function() {
    FB.init({
      appId      : '{your-app-id}',
      cookie     : true,
      xfbml      : true,
      version    : '{api-version}'
    });
      
    FB.AppEvents.logPageView();   
      
  };

  (function(d, s, id){
     var js, fjs = d.getElementsByTagName(s)[0];
     if (d.getElementById(id)) {return;}
     js = d.createElement(s); js.id = id;
     js.src = "https://connect.facebook.net/en_US/sdk.js";
     fjs.parentNode.insertBefore(js, fjs);
   }(document, 'script', 'facebook-jssdk'));
</script>
