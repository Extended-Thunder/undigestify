var UndigestifyKamensUs = function() {}

UndigestifyKamensUs.UpdateMenuItems = function(e) {
    var hidden = !gDBView || gDBView.numSelected == 0;
    var menu1 = document.getElementById("KamensUs:menu_undigestify");
    if (menu1) {
	if (hidden) {
	    menu1.setAttribute("disabled", "true");
	}
	else {
	    menu1.removeAttribute("disabled");
	}
    }
    var menu2 = document.getElementById("KamensUs:menu_popup_undigestify");
    if (menu2) {
	if (hidden) {
	    menu2.setAttribute("disabled", "true");
	}
	else {
	    menu2.removeAttribute("disabled");
	}
    }
}

UndigestifyKamensUs.Initialize = function(e) {
    var messageMenu = document.getElementById("messageMenuPopup");
    if (messageMenu) {
	messageMenu.addEventListener("popupshowing",
				     UndigestifyKamensUs.UpdateMenuItems,
				     false);
    }
    var contextMenu = document.getElementById("mailContext");
    if (contextMenu) {
	contextMenu.addEventListener("popupshowing",
				     UndigestifyKamensUs.UpdateMenuItems,
				     false);
    }
}

UndigestifyKamensUs.IsThunderbird2 = function() {
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
        .getService(Components.interfaces.nsIXULAppInfo);
    if (appInfo.name != "Thunderbird") {
	return false;
    }
    var versionChecker = Components
	.classes["@mozilla.org/xpcom/version-comparator;1"]
        .getService(Components.interfaces.nsIVersionComparator);
    return(versionChecker.compare(appInfo.version, "3.0") < 0);
};

UndigestifyKamensUs.IsPostbox = function() {
    var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
        .getService(Components.interfaces.nsIXULAppInfo);
    return(appInfo.name == "Postbox");
};

UndigestifyKamensUs.CopyServiceListener = function(file, stop_notify, closure) {
    this._file = file;
    this._stop_notify = stop_notify;
    this._closure = closure;
}

UndigestifyKamensUs.CopyServiceListener.prototype = {
    QueryInterface : function(iid) {
	if (iid.equals(Components.interfaces.nsIMsgCopyServiceListener) ||
	    iid.equals(Components.interfaces.nsISupports)) {
	    return this;
	}
	throw Components.results.NS_NOINTERFACE;
    },

    OnProgress: function (progress, progressMax) {
    },

    OnStartCopy: function () {
    },

    OnStopCopy: function ( status ) {
	if (this._file.exists()) this._file.remove(true);
	this._stop_notify(this._closure);
	this._stop_notify = undefined;
	this._closure = undefined;
    },

    SetMessageKey: function (key ) {}
};

UndigestifyKamensUs.UriStreamListener = function(messageHDR) {
    this._header = messageHDR;
    this._buffer = "";         // buffer of lines read in current section
    this._fragment = "";       // unprocessed text
    this._preambled = false;   // past preamble
    this._headered = false;    // past message or enclosure headers
    this._headers = "";        // message headers for merging into
                               // each enclosure
    this._subject = "";        // subject from message headers
    this._messages = 0;
    this._toCopy = Array();
    this.copying = false;
};

UndigestifyKamensUs.UriStreamListener.prototype = {
    // Utility functions

    _copy_next: function(closure) {
	if (closure._toCopy.length == 0) {
	    closure.copying = false;
	    return;
	}
	closure.copying = true;
	var msgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"]
	    .createInstance();
	msgWindow = msgWindow.QueryInterface(Components.interfaces
					     .nsIMsgWindow);
	var filePath = closure._toCopy.shift().path;

	var sfile = Components.classes["@mozilla.org/file/local;1"]
	    .createInstance(Components.interfaces.nsILocalFile);
	sfile.initWithPath(filePath);
	var folder = closure._header.folder;
	var copyService = Components
	    .classes["@mozilla.org/messenger/messagecopyservice;1"]
	    .createInstance();
	copyService = copyService.QueryInterface(Components.interfaces
						 .nsIMsgCopyService);
	if (UndigestifyKamensUs.IsPostbox()) {
	    copyService.CopyFileMessage(sfile, folder, 0, "",
					new UndigestifyKamensUs.CopyServiceListener(sFile, closure._copy_next, closure),
					msgWindow);
	}
	else if (UndigestifyKamensUs.IsThunderbird2()) {
	    var fileSpc = Components.classes["@mozilla.org/filespec;1"]
		.createInstance();
	    fileSpc = fileSpc.QueryInterface(Components.interfaces.nsIFileSpec);
	    fileSpc.nativePath = filePath;
	    copyService.CopyFileMessage(fileSpc, folder, null, false, 0,
					new UndigestifyKamensUs.CopyServiceListener(sFile, closure._copy_next, closure),
					msgWindow);
	}
	else {
	    copyService.CopyFileMessage(sfile, folder, null, false, 0, "",
					new UndigestifyKamensUs.CopyServiceListener(sfile, closure._copy_next, closure),
					msgWindow);
	}
    },

    _save_message: function() {
	// save message from buffer into folder.
	var dirService = Components
	    .classes["@mozilla.org/file/directory_service;1"]
	    .getService(Components.interfaces.nsIProperties);
	var tempDir = dirService.get("TmpD", Components.interfaces.nsIFile);
	var sfile = Components.classes["@mozilla.org/file/local;1"]
	    .createInstance(Components.interfaces.nsILocalFile);
	sfile.initWithPath(tempDir.path);
	this._messages++;
	sfile.appendRelativePath("tempMsg" + this._header.messageId + "." +
				 this._messages + ".eml");
	var filePath = sfile.path;
	if (sfile.exists()) sfile.remove(true);
	sfile.create(sfile.NORMAL_FILE_TYPE, 0600);
	var stream = Components
	    .classes['@mozilla.org/network/file-output-stream;1']
	    .createInstance(Components.interfaces.nsIFileOutputStream);
	stream.init(sfile, 2, 0x200, false);
	this._buffer = this._buffer.replace(/\n/g, "\r\n");
	stream.write(this._buffer, this._buffer.length);
	stream.close();
	this._toCopy.push(sfile);
	if (! this.copying) {
	    this._copy_next(this);
	}
    },

    _merge_headers: function() {
	// Merge _buffer into _headers and replace _buffer.
	// * Append subject of main message in parentheses after
	//   enclosure subject.
	// * Append Message ID of main message to References of
	//   enclosure (or create new References if there isn't one).
	// * Remove Message ID from main message.
	// * All other headers in enclosure override main message
	//   headers.
	var main = this._headers;
	var enclosure = this._buffer;

	var main_message_id = this._get_header(main, "resent-message-id");
	if (! main_message_id.length) {
	    main_message_id = this._get_header(main, "message-id");
	    main = this._strip_header(main, "message-id");
	}
	else {
	    main = this_strip_header(main, "resent-message-id");
	}
	var main_references = this._get_header(main, "references");
	main = this._strip_header(main, "references");
	var enclosure_references = this._get_header(enclosure,
						    "references");
	enclosure = this._strip_header(enclosure, "references");
	main = "References: " + main_references + " "
	    + enclosure_references + " " + main_message_id + "\n" + main;

	var main_subject = this._subject;
	if (main_subject.length) {
	    var enclosure_subject = this._get_header(enclosure, "subject");
	    if (enclosure_subject.length) {
		main = this._strip_header(main, "subject");
		enclosure = this._strip_header(enclosure, "subject");
		main = "Subject: " + enclosure_subject + " (" +
		    main_subject + ")\n" + main;
	    }
	}

	var enclosure_headers = enclosure.match(/^\S[^:]*/mg);
	var header;
	for (header in enclosure_headers) {
	    main = this._strip_header(main, enclosure_headers[header]);
	}

	this._buffer = main.slice(0, main.length-1) + enclosure;
    },

    _strip_header: function(headers, header) {
	// Remove all instances of the specified header from headers and
	// return new headers.
	var re = new RegExp("^" + header + ":.*\n([ \t].*\n)*", "mig");
	return headers.replace(re, "");
    },

    _get_header: function(headers, header) {
	// "headers" is a string containing headers. "header" is the
	// name of the header we want. Retrieves the first instance of
	// that header, collapsing multicolumn header values into one
	// line, and returning the result or an empty string if there
	// is none.
	var re = new RegExp("^" + header + ":.*(\n[ \t].*)*", "mi");
	var matches = headers.match(re);
	if (matches && matches.length) {
	    return(matches[0].replace(/^[^:]+:\s*/, "")
		   .replace(/\n\s+/g, " "));
	}
	else {
	    return "";
	}
    },

    // Required listener entry points

    QueryInterface: function(iid) {
	if (iid.equals(Components.interfaces.nsIStreamListener) ||
	    iid.equals(Components.interfaces.nsISupports)) {
	    return this;
	}
	return null;
    },

    onStartRequest: function(aReq, aContext) {},

    onStopRequest: function(aReq, aContext, aStatusCode) {
	if (this._preambled && this._headered) {
	    this._save_message();
	}
    },

    onDataAvailable: function(aReq, aContext, aInputStream, aOffset, aCount) {
	var stream = Components
	    .classes["@mozilla.org/scriptableinputstream;1"]
	    .createInstance()
	    .QueryInterface(Components.interfaces
			    .nsIScriptableInputStream);
	stream.init(aInputStream);
	var data = stream.read(aCount);
	if (this._fragment.length) {
	    data = this._fragment + data;
	    this._fragment = "";
	}
	data = data.replace(/\r\n/g, "\n");
	while (true) {
	    var eol = data.search(/\n/);
	    if (eol < 0) {
		break;
	    }
	    var line = data.slice(0, eol+1);
	    data = data.slice(eol+1);
	    if (! this._preambled) {
		if (! this._headered) {
		    // still in message header
		    this._buffer += line;
		    if (line == "\n") {
			this._headers = this._strip_header(this._buffer,
							   "received");
			this._subject = this._get_header(this._headers,
							 "subject");
			this._headered = true;
		    }
		}
		else if (line == "----------------------------------------------------------------------\n") {
		    // separator line, but only if followed by a blank line
		    if (! data.length) {
			this._fragment = line;
		    }
		    else if (data.slice(0, 1) == "\n") {
			// header separator has been found
			data = data.slice(1, data.length);
			this._save_message();
			this._buffer = "";
			this._preambled = true;
			this._headered = false;
		    }
		    else {
			this._buffer += line;
		    }
		}
		else {
		    this._buffer += line;
		}
	    }
	    else if (! this._headered) {
		// in header of an enclosure
		if (! this._buffer.length && line.match(/^End of /)) {
		    // all done!
		    aInputStream.close();
		    return;
		}
		this._buffer += line;
		if (line == "\n") {
		    this._merge_headers();
		    this._headered = true;
		}
	    }
	    else if (line == "------------------------------\n") {
		// separator line, but only if followed by a blank line
		if (! data.length) {
		    this._fragment = line;
		}
		else if (data.slice(0, 1) == "\n") {
		    // enclosure separator has been found
		    data = data.slice(1, data.length);
		    this._save_message();
		    this._buffer = "";
		    this._headered = false;
		}
		else {
		    this._buffer += line;
		}
	    }
	    else {
		this._buffer += line;
	    }
	}
	if (data) {
	    this._fragment = data;
	}
    }
};

UndigestifyKamensUs.Undigestify = function() {
    var uri = gDBView.URIForFirstSelectedMessage;
    var service = messenger.messageServiceFromURI(uri);
    var hdr = messenger.msgHdrFromURI(uri);
    var listener = new UndigestifyKamensUs.UriStreamListener(hdr);
    var msgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"]
	.createInstance();
    msgWindow = msgWindow.QueryInterface(Components.interfaces.nsIMsgWindow);
    service.streamMessage(uri, listener, msgWindow, null, false, null);
};

window.addEventListener("load", UndigestifyKamensUs.Initialize, false);
