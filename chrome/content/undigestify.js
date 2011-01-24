var UndigestifyKamensUs = function() {}

// Constants and states
UndigestifyKamensUs.PREAMBLE_SEPARATOR =
    "----------------------------------------------------------------------";
UndigestifyKamensUs.ENCLOSURE_SEPARATOR = "------------------------------";

UndigestifyKamensUs.PREAMBLE_HEADER = 1;
UndigestifyKamensUs.PREAMBLE_BODY = 2;
UndigestifyKamensUs.PREAMBLE_BLANK = 3;
UndigestifyKamensUs.ENCLOSURE_HEADER = 4;
UndigestifyKamensUs.ENCLOSURE_BODY = 5;
UndigestifyKamensUs.ENCLOSURE_BLANK = 6;
UndigestifyKamensUs.TRAILER_STARS = 7;
UndigestifyKamensUs.TRAILER_DONE = 8;
UndigestifyKamensUs.ERROR = 9;

UndigestifyKamensUs.boolAttribute = function(node, attribute, value) {
    if (value) {
	node.setAttribute(attribute, "true");
    }
    else {
	node.removeAttribute(attribute);
    }
}

UndigestifyKamensUs.UpdateMenuItems = function(e) {
    var disabled = !gDBView || gDBView.numSelected == 0;
    var pop = document.popupNode;
    var hidden;
    if (pop) {
	hidden = true;
	while (pop) {
	    if (pop.id == "threadTree") {
		hidden = false;
		break;
	    }
	    pop = pop.parentNode;
	}
    }
    else {
	hidden = false;
    }
    var menu1 = document.getElementById("KamensUs:menu_undigestify");
    if (menu1) {
	UndigestifyKamensUs.boolAttribute(menu1, "disabled", disabled);
    }
    var menu2 = document.getElementById("KamensUs:menu_popup_undigestify");
    if (menu2) {
	UndigestifyKamensUs.boolAttribute(menu2, "disabled", disabled);
	UndigestifyKamensUs.boolAttribute(menu2, "hidden", hidden);
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

UndigestifyKamensUs.CopyServiceListener = function(file) {
    this._file = file;
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
	// dump("OnProgress");
    },

    OnStartCopy: function () {
	// dump("OnStartCopy\n");
    },

    OnStopCopy: function (status) {
	// dump("OnStopCopy\n");
	if (! Components.isSuccessCode(status)) {
	    alert("Undigestify: Error copying undigestified message into folder. Message may not have been fully undigestified.");
	}
	if (this._file.exists()) this._file.remove(true);
    },

    SetMessageKey: function (key) {}
};

UndigestifyKamensUs.UriStreamListener = function(messageHDR) {
    this._header = messageHDR;
    this._buffer = "";         // buffer of lines read in current section
    this._fragment = "";       // unprocessed text
    this._state = UndigestifyKamensUs.PREAMBLE_HEADER;
    this._headers = "";        // message headers for merging into
                               // each enclosure
    this._subject = "";        // subject from message headers
    this._id = "";
    this._messages = 0;
    this._toCopy = Array();
};

UndigestifyKamensUs.UriStreamListener.prototype = {
    // Utility functions

    _save_message: function() {
	// save message from buffer into folder.
	var dirService = Components
	    .classes["@mozilla.org/file/directory_service;1"]
	    .getService(Components.interfaces.nsIProperties);
	var tempDir = dirService.get("TmpD", Components.interfaces.nsIFile);
	var sfile = Components.classes["@mozilla.org/file/local;1"]
	    .createInstance(Components.interfaces.nsILocalFile);
	sfile.initWithPath(tempDir.path);
	var uuidGenerator = 
	    Components.classes["@mozilla.org/uuid-generator;1"]
	    .getService(Components.interfaces.nsIUUIDGenerator);
	var uuid = uuidGenerator.generateUUID().toString();
	sfile.appendRelativePath("tempMsg" + uuid + ".eml");
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
    },

    _error: function(stream, message) {
	if (stream != undefined) {
	    stream.close();
	}
	this._state = UndigestifyKamensUs.ERROR;
	alert("Undigestify: " + message);
    },

    // id argument only used the first time the function is called
    _make_id: function(id) {
	var uuidGenerator = 
	    Components.classes["@mozilla.org/uuid-generator;1"]
	    .getService(Components.interfaces.nsIUUIDGenerator);
	var uuid = uuidGenerator.generateUUID().toString();
	if (! this._id) {
	    if (! id) {
		id = "<" + uuid + "@undigestify.kamens.us>";
	    }
	    id = id.replace(/@/, "." + uuid + "." + this._messages + "@");
	    this._id = id;
	}
	else {
	    id = this._id.replace(/\d+@/, this._messages + "@");
	}
	this._messages++;
	return id;
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

	var main_message_id = this._id;
	var main_references = this._get_header(main, "references");
	main = this._strip_header(main, "references");
	main = this._strip_header(main, "message-id");
	var enclosure_references = this._get_header(enclosure,
						    "references");
	enclosure = this._strip_header(enclosure, "references");
	main = "References: " + main_references + " "
	    + enclosure_references + " " + main_message_id + "\n" + main;
	main = "Message-ID: " + this._make_id() + "\n" + main;

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
		   .replace(/\n\s+/g, " ")).replace(/\s+$/, "");
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
	switch (this._state) {
	case UndigestifyKamensUs.ERROR:
	    break;
	case UndigestifyKamensUs.PREAMBLE_HEADER:
	    this._error(undefined, "Message has no body");
	    break;
	case UndigestifyKamensUs.PREAMBLE_BODY:
	    this._error(undefined, "No preamble separator");
	    break;
	case UndigestifyKamensUs.PREAMBLE_BLANK:
	    this._error(undefined, "No enclosures");
	    break;
	case UndigestifyKamensUs.ENCLOSURE_HEADER:
	    if (this._buffer == "") {
		if (this._toCopy.length == 1) {
		    this._error(undefined, "No enclosures");
		}
		break;
	    }
	case UndigestifyKamensUs.ENCLOSURE_BODY:
	case UndigestifyKamensUs.ENCLOSURE_BLANK:
	case UndigestifyKamensUs.TRAILER_STARS:
	case UndigestifyKamensUs.TRAILER_DONE:
	    if (this._buffer != "") {
		this._save_message();
	    }
	    var i;
	    for (i in this._toCopy) {
		var file = this._toCopy[i];
		var listener = new UndigestifyKamensUs
		    .CopyServiceListener(file.path);
		var copyService = Components
		    .classes["@mozilla.org/messenger/messagecopyservice;1"]
		    .getService(Components.interfaces.nsIMsgCopyService);
		var folder = this._header.folder;
		var msgWindow = Components
		    .classes["@mozilla.org/messenger/msgwindow;1"]
		    .createInstance();
		if (UndigestifyKamensUs.IsPostbox()) {
		    var sfile = Components.classes["@mozilla.org/file/local;1"]
			.createInstance(Components.interfaces.nsILocalFile);
		    sfile.initWithPath(file.path);
		    copyService.CopyFileMessage(sfile, folder, 0, "", listener,
						msgWindow);
		}
		else if (UndigestifyKamensUs.IsThunderbird2()) {
		    var fileSpc = Components.classes["@mozilla.org/filespec;1"]
			.createInstance()
			.QueryInterface(Components.interfaces.nsIFileSpec);
		    fileSpc.nativePath = file.path;
		    copyService.CopyFileMessage(fileSpc, folder, null, false,
						0, listener, msgWindow);
		}
		else {
		    var sfile = Components.classes["@mozilla.org/file/local;1"]
			.createInstance(Components.interfaces.nsILocalFile);
		    sfile.initWithPath(file.path);
		    copyService.CopyFileMessage(sfile, folder, null, false, 0,
						"", listener, msgWindow);
		}
	    }
	    break;
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
	    switch (this._state) {
	    case UndigestifyKamensUs.PREAMBLE_HEADER:
		this._buffer += line;
		if (line == "\n") {
		    var id = this._get_header(this._buffer, 
					      "resent-message-id");
		    if (id) {
			this._buffer =
			    this._strip_header(this._buffer,
					       "resent-message-id");
		    }
		    else {
			id = this._get_header(this._buffer, "message-id");
			this._buffer =
			    this._strip_header(this._buffer, "message-id");
		    }
		    this._id = this._make_id(id);
		    var refs = this._get_header(this._buffer, "references");
		    this._buffer = this._strip_header(this._buffer,
						      "references");
		    this._buffer = this._strip_header(this._buffer,
						      "received");
		    this._buffer = "Message-ID: " + this._id + "\n" +
			"References: " + refs + " " + id + "\n" +
			this._buffer;
		    this._subject = this._get_header(this._buffer,
						     "subject");
		    this._headers = this._buffer;
		    this._state = UndigestifyKamensUs.PREAMBLE_BODY;
		}
		break;
	    case UndigestifyKamensUs.PREAMBLE_BODY:
		if (line.replace(/\s*$/, "") ==
		    UndigestifyKamensUs.PREAMBLE_SEPARATOR) {
		    this._state = UndigestifyKamensUs.PREAMBLE_BLANK;
		}
		else {
		    this._buffer += line;
		}
		break;
	    case UndigestifyKamensUs.PREAMBLE_BLANK:
		if (line.replace(/^\s*$/, "") == "") {
		    this._save_message();
		    this._buffer = "";
		    this._state = UndigestifyKamensUs.ENCLOSURE_HEADER;
		}
		else {
		    this._buffer += UndigestifyKamensUs.PREAMBLE_SEPARATOR + "\n" +
			line;
		    this._state = UndigestifyKamensUs.PREAMBLE_BODY;
		}
		break;
	    case UndigestifyKamensUs.ENCLOSURE_HEADER:
		if (line.match(/^\s*$/)) {
		    if (this._buffer == "") {
			this._error(aInputStream, "Missing enclosure header");
		    }
		    this._buffer += line;
		    this._merge_headers();
		    this._state = UndigestifyKamensUs.ENCLOSURE_BODY;
		}
		else if (line.match(/^End of /) && this._buffer == "") {
		    this._state = UndigestifyKamensUs.TRAILER_STARS;
		}
		else if (! line.match(/^[^\s:]+:/) &&
			 ! (line.buffer != "" && line.match(/^[ \t]/))) {
		    this._error(aInputStream, "Malformed enclosure header");
		}
		else {
		    this._buffer += line;
		}
		break;
	    case UndigestifyKamensUs.ENCLOSURE_BODY:
		if (line.replace(/\s*$/, "") ==
		    UndigestifyKamensUs.ENCLOSURE_SEPARATOR) {
		    this._state = UndigestifyKamensUs.ENCLOSURE_BLANK;
		}
		else {
		    this._buffer += line;
		}
		break;
	    case UndigestifyKamensUs.ENCLOSURE_BLANK:
		if (line.replace(/^\s*$/, "") == "") {
		    this._save_message();
		    this._buffer = "";
		    this._state = UndigestifyKamensUs.ENCLOSURE_HEADER;
		}
		else {
		    this._buffer += UndigestifyKamensUs.ENCLOSURE_SEPARATOR 
			+ "\n" + line;
		    this._state = UndigestifyKamensUs.ENCLOSURE_BODY;
		}
		break;
	    case UndigestifyKamensUs.TRAILER_STARS:
		if (! line.match(/^\*+\s*$/)) {
		    this._error(aInputStream, "Malformed trailer");
		}
		else {
		    this._state = UndigestifyKamensUs.TRAILER_DONE;
		}
		break;
	    case UndigestifyKamensUs.TRAILER_DONE:
		if (! line.match(/^\s*$/)) {
		    this._error(aInputStream,
				"Unexpected content after trailer");
		}
		break;
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
