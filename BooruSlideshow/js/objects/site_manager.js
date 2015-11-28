var SiteManager = function (id, url, pageLimit)
{
	this.id = id;
	this.url = url;
	this.pageLimit = pageLimit;
	this.lastPageLoaded = 0;
	this.isEnabled = false;
	this.allPosts = [];
	this.hasExhaustedSearch = false;
}

SiteManager.prototype.buildRequestUrl = function(searchText, pageNumber)
{
	switch (this.id)
	{
		case SITE_GELBOORU:
		case SITE_RULE34:
		case SITE_SAFEBOORU:
			return this.url + '/index.php?page=dapi&s=post&q=index&tags=' + searchText + '&pid=' + (pageNumber - 1) + '&limit=' + this.pageLimit;
		case SITE_DANBOORU:
			return this.url + '/posts.json?tags=' + searchText + '&page=' + pageNumber + '&limit=' + this.pageLimit;
		case SITE_E621:
			return this.url + '/post/index.json?tags=' + searchText + '&page=' + pageNumber + '&limit=' + this.pageLimit;
		default:
			console.log('Error building the URL. Supplied site ID is not in the list.');
			return;
	}
}

SiteManager.prototype.resetConnection = function()
{
	if (this.xhr != null) 
		this.xhr.abort();
	
	this.xhr = new XMLHttpRequest();
	
	this.lastPageLoaded = 0;
	this.isEnabled = false;
	this.allPosts = [];
	this.hasExhaustedSearch = false;
}

SiteManager.prototype.enable = function()
{
	this.isEnabled = true;
}

SiteManager.prototype.performSearch = function(searchText, doneSearchingSiteCallback)
{
	var pageNumber = this.lastPageLoaded + 1;
	var url = this.buildRequestUrl(searchText, pageNumber);
	
	if (url != null)
	{
		this.makeWebsiteRequest(url, doneSearchingSiteCallback);
	}
}

SiteManager.prototype.makeWebsiteRequest = function(url, doneSearchingSiteCallback)
{
	var method = 'GET';
	
	if (this.xhr != null) 
		this.xhr.abort();
	
	this.xhr = new XMLHttpRequest();
	
	if ("withCredentials" in this.xhr) {
		// XHR for Chrome/Firefox/Opera/Safari.
		this.xhr.open(method, url, true);
	} else if (typeof XDomainRequest != "undefined") {
		// XDomainRequest for IE.
		this.xhr = new XDomainRequest();
		this.xhr.open(method, url);
	} else {
		// CORS not supported.
		this.xhr = null;
	}
	
	var siteManager = this;
	
	this.xhr.onload = function() {
		siteManager.lastPageLoaded++;
		
		var responseText = siteManager.xhr.responseText;
		siteManager.addPosts(responseText);
		
		doneSearchingSiteCallback.call(siteManager);
	};
	
	this.xhr.onerror = function() {
		displayWarningMessage('Error making the request to the website');
	};
	
	this.xhr.send();
}

SiteManager.prototype.addPosts = function(responseText)
{
	if (this.id == SITE_GELBOORU || this.id == SITE_RULE34 || this.id == SITE_SAFEBOORU)
	{
		this.addXmlPosts(responseText);
	}
	else
	{
		this.addJsonPosts(responseText);
	}
}
	
SiteManager.prototype.addXmlPosts = function(xmlResponseText)
{
	parser = new DOMParser();
	xml = parser.parseFromString(xmlResponseText, "text/xml");
	
	var xmlPosts = xml.getElementsByTagName("post");
	
	this.hasExhaustedSearch = (xmlPosts.length < this.pageLimit);
	
	for (var i = 0; i < xmlPosts.length; i++)
	{
		var xmlPost = xmlPosts[i];
		
		this.addXmlPost(xmlPost);
	}
}

SiteManager.prototype.addJsonPosts = function(jsonResponseText)
{
	var jsonPosts = JSON.parse(jsonResponseText);
	this.hasExhaustedSearch = (jsonPosts.length < this.pageLimit);
	
	for (var i = 0; i < jsonPosts.length; i++)
	{
		var jsonPost = jsonPosts[i];
		
		this.addJsonPost(jsonPost);
	}
}

SiteManager.prototype.addXmlPost = function(jsonObject)
{
	this.addPostGelRuleSafe(jsonObject);
}

SiteManager.prototype.addJsonPost = function(jsonObject)
{
	switch (this.id)
	{
		case SITE_DANBOORU:
			this.addPostDanbooru(jsonObject);
			break;
		case SITE_E621:
			this.addPostE621(jsonObject);
			break;
	}
}

SiteManager.prototype.addPostGelRuleSafe = function(xmlPost)
{
	if (xmlPost.hasAttribute('file_url') &&
		xmlPost.hasAttribute('preview_url'))
	{
		var fileExtension = xmlPost.getAttribute('file_url').substring(xmlPost.getAttribute('file_url').length - 4);
		
		if (this.isFileExtensionSupported(fileExtension))
		{
			var newPost = new Post(
				xmlPost.getAttribute('id'),
				xmlPost.getAttribute('file_url'),
				xmlPost.getAttribute('preview_url'),
				this.url + '/index.php?page=post&s=view&id=' + xmlPost.getAttribute('id'),
				xmlPost.getAttribute('width'),
				xmlPost.getAttribute('height'),
				new Date(xmlPost.getAttribute('created_at'))
			);
			
			this.allPosts.push(newPost);
		}
	}
}

SiteManager.prototype.addPostDanbooru = function(jsonObject)
{
	if (jsonObject.hasOwnProperty('file_url') &&
		jsonObject.hasOwnProperty('preview_file_url'))
	{
		var fileExtension = jsonObject.file_url.substring(jsonObject.file_url.length - 4);
		
		if (this.isFileExtensionSupported(fileExtension))
		{
			var newPost = new Post(
				jsonObject.id,
				this.url + jsonObject.file_url,
				this.url + jsonObject.preview_file_url,
				this.url + '/posts/' + jsonObject.id,
				jsonObject.image_width,
				jsonObject.image_height,
				new Date(jsonObject.created_at)
			);
			this.allPosts.push(newPost);
		}
	}
}

SiteManager.prototype.addPostE621 = function(jsonObject)
{
	if (jsonObject.hasOwnProperty('file_url') &&
		jsonObject.hasOwnProperty('preview_url'))
	{
		var fileExtension = jsonObject.file_url.substring(jsonObject.file_url.length - 4);
		
		if (this.isFileExtensionSupported(fileExtension))
		{
			var newPost = new Post(
				jsonObject.id,
				jsonObject.file_url,
				jsonObject.preview_url,
				this.url + '/post/show/' + jsonObject.id,
				jsonObject.width,
				jsonObject.height,
				this.convertSDateToDate(jsonObject.created_at.s)
			);
			this.allPosts.push(newPost);
		}
	}
}

SiteManager.prototype.getTotalImageNumber = function()
{
	return this.allPosts.length;
}

SiteManager.prototype.hasntExhaustedSearch = function()
{
	return this.isEnabled && !this.hasExhaustedSearch;
}


SiteManager.prototype.convertSDateToDate = function(sDate)
{
	return date = new Date(sDate * 1000);
}

SiteManager.prototype.isFileExtensionSupported = function (fileExtension)
{
    return fileExtension != '.zip' && // No zip files
        fileExtension != '.swf' && // No flash files
        fileExtension != 'webm'; // No video files
}