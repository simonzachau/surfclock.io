// load new url

// chrome.webNavigation.onCompleted.addListener(function(details) {
// 	chrome.tabs.get(details.tabId, function(tab) {
// 		if(tab && tab.active && tab.url) {
// 			logger.handleUrl(tab.url);
// 		}
// 	});
// });

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	// is updated tab active?
	var url = changeInfo.url;
	if(tab.active && url) {
		logger.handleUrl(url);
	}
});

// switch tab

chrome.tabs.onActivated.addListener(function(activeInfo) {
	chrome.tabs.get(activeInfo.tabId, function(tab) {
		var url = tab.url
		logger.handleUrl(url);
	});
});

// switch window

chrome.windows.onFocusChanged.addListener(function(windowId) {
	if(windowId == chrome.windows.WINDOW_ID_NONE) {
		// no window is focused -> Google Chrome inactive
		logger.endInterval();
	} else {
		// find active tab of newly focused window
		chrome.tabs.query({
			'active': true, 
			'windowId': windowId
		}, function(tabs) {
			var tab = tabs[0];
			var url = tab.url;
			logger.handleUrl(url);
		});
	}
});

function getFaviconUrl(url) {
	// return 'chrome://favicon/' + url;
	return 'http' + url.match(/:\/\/(.[^/]+)/)[0] + '/favicon.ico';
}