            NodeList.prototype.forEach = NodeList.prototype.forEach || Array.prototype.forEach;
HTMLCollection.prototype.forEach = HTMLCollection.prototype.forEach || Array.prototype.forEach;
    DOMTokenList.prototype.forEach = DOMTokenList.prototype.forEach || Array.prototype.forEach;

HTMLSelectElement.prototype.getSelected = function(){
	var s = [];
	for (var i = 0; i < this.length; i++) {
		if (this[i].selected)
			s.push(this[i].value);
	}
	return s;
};

String.prototype.ucFirst = function(){
	return this.charAt(0).toUpperCase() + this.slice(1);
};

function $(s){
	return document.querySelector(s);
}
function $$(s){
	return document.querySelectorAll(s);
}

var evalOrg = {};
(function()
{
	"use strict";

	var self = this,
		refreshTimer,
		refreshCount = 0,
		perfAggregates = undefined;
	this.editor = undefined;
	this.livePush = undefined;

	this.initialize = function()
	{
		window.addEventListener('error', this.postError);
		window.addEventListener('message', this.externalMessage.bind(this));

		this.applyPrefs();
		this.enableFocus();

		$$('a[href^="http"]').forEach(function (el) {
			el.setAttribute('target', '_blank');
			el.setAttribute('rel', 'noopener');
		});

		if ($('h2.exception'))
			document.body.classList.add('error');

		document.body.classList.forEach(function (c) {
			if ('function' == typeof this['handle' + c.ucFirst()])
				window.addEventListener('load', this['handle' + c.ucFirst()].bind(this));
		}.bind(this));

		$$('.alert').forEach(function (el) {
			el.addEventListener('touchstart', function () {
				el.remove();
			});
		});
	};

	var loadScript = function(url, f)
	{
		var s = document.createElement('script');
		s.setAttribute('src', url);

		s.onload = function () {
			if ('function' == typeof f)
				f();

			document.head.removeChild(this)
		}.bind(s);

		document.head.appendChild(s);
	};

	this.postError = function(e) {
		// https://www.ravikiranj.net/posts/2014/code/how-fix-cryptic-script-error-javascript/
		if (e.message === 'Script error.')
			return;

		// Googlebot throws this when using NodeList.forEach
		if (e.message === 'Uncaught TypeError: undefined is not a function')
			return;

		// Yandex through HeadlessChrome, but not reproducible
		if (e.message === 'Uncaught ')
			return;

		var xhr = new XMLHttpRequest();
		xhr.open('post', '/javascript-error/' + encodeURIComponent(e.message));
		xhr.send();
	};

	this.applyDarkmode = function(enable)
	{
		if (enable) {
			document.documentElement.classList.add('darkMode');

			if (this.editor)
				this.editor.setTheme('ace/theme/chaos');
		} else {
			document.documentElement.classList.remove('darkMode');

			if (this.editor)
				this.editor.setTheme('ace/theme/chrome');
		}
	};

	this.applyPrefs = function()
	{
		var defaul = false;
		if (localStorage.getItem("darkMode") === "enable")
			defaul = true;
		else if (localStorage.getItem("darkMode") === "disable")
			defaul = false;
		else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
			defaul = true;

		this.applyDarkmode(defaul);

		if (defaul)
			$('#darkMode').setAttribute('checked', 'checked');

		$('#darkMode').addEventListener('change', function (e) {
			localStorage.setItem('darkMode', e.target.checked ? 'enable' : 'disable');
			this.applyDarkmode(e.target.checked)
		}.bind(this));


		if (localStorage.getItem("livePreview") !== "disable")
			$('#livePreview').setAttribute('checked', 'checked');

		$('#livePreview').addEventListener('change', function (e) {
			localStorage.setItem('livePreview', e.target.checked ? 'enable' : 'disable');
		});
	}

	this.richEditor = function()
	{
		if (this.editor)
			return false;

		var code = $('code');
		var textarea = $('textarea[name=code]');

		textarea.value = code.textContent;

		// If ace somehow doesn't load; make sure js doesn't crash
		if ('object' != typeof ace)
			document.body.classList.add('mobile');

		// Disable ace for mobile-devices; see https://github.com/ajaxorg/ace/issues/37
		if (document.body.classList.contains('mobile'))
			return;

		// Use a shim to keep ff happy
		ace.config.set('workerPath', '/s/');
		ace.require('ace/ext/language_tools');
		this.editor = ace.edit(code);

		if (document.documentElement.classList.contains('darkMode'))
			this.editor.setTheme('ace/theme/chaos');
		else
			this.editor.setTheme('ace/theme/chrome');

		this.editor.setShowPrintMargin(false);
		this.editor.setOption('maxLines', Infinity);
		this.editor.session.setMode('ace/mode/php');
		this.editor.session.setUseWrapMode(true);
		this.editor.setOptions({
			enableBasicAutocompletion: true,
			enableLiveAutocompletion: false
		});

		$$('textarea.ace_text-input').forEach(function(el){
			el.setAttribute('aria-label', textarea.getAttribute('aria-label'));
		});

		if ($('input[type=submit]'))
			$('input[type=submit]').setAttribute('disabled', 'disabled');

		$('#newForm').addEventListener('submit', function(){
			textarea.value = this.editor.getValue();
		}.bind(this));

		this.editor.on('change', function(){
			$('#newForm').classList.add('changed');

			if (!$('#tabs.abusive'))
				$('input[type=submit]').removeAttribute('disabled');

			if ($('#live_preview'))
			{
				if ('number' == typeof this.livePush)
					clearInterval(this.livePush);

				return this.livePush = setTimeout(this.livePreviewPush.bind(this), 500);
			}

			if ($('#livePreview').checked)
				this.livePreviewCreate();
		}.bind(this));
	};

	this.livePreviewCreate = function()
	{
		history.pushState({}, 'preview', '/#live');

		outputClearTabs();

		$('#tabs').classList.add('busy');
		$('#tabs').appendChild(object2Dom({
			li: {
				'class': 'active',
				a: {href: '/#live', _text: 'Live-preview'}
			}
		}));

		$('#tab').appendChild(object2Dom({
			dl:{
				dt: {_text: "Output for php 8.1.12"},
				dd: {
					div: {
						id: 'live_preview',
						'data-cfg': $('base').getAttribute('href')+'live/x86.cfg',
		}	}	}	}));

		_launchVm('init=/sbin/preview');

		// every 250ms, check if _malloc is defined (vm running) so we can push
		var check = setInterval(function(){
			if ('undefined' == typeof _malloc)
				return;

			if ('number' == typeof this.livePush)
				clearInterval(this.livePush);

			clearInterval(check);
			this.livePush = setTimeout(this.livePreviewPush.bind(this), 250);
		}.bind(this), 250);
	};

	this.livePreviewPush = function(){
		if (this.editor)
			var content = this.editor.getValue();
		else
			var content = $('textarea[name=code]').value;

		var buf = new TextEncoder("utf-8").encode(content);
		var buf_len = buf.length;
		var buf_addr = _malloc(buf_len);
		HEAPU8.set(buf, buf_addr);

		$('#tabs').classList.add('busy');

		window.fs_import_file('preview', buf_addr, buf_len);
	};

	// this method processes untrusted events from external domains
	this.externalMessage = function(e)
	{
		document.body.classList.add('embedded');

		// we might run before ace is initialized
		if (this.editor)
			this.editor.setValue(e.data);
		else
			$('textarea[name=code]').value = e.data;

		if (window.location.hash == '#live')
			this.livePreviewCreate();

		// notify caller about script state
		var state;

		setInterval(function(){
			var newState = $('#tabs').classList.contains('busy') ? 'busy' : 'done';

			if (newState == state)
				return;

			e.source.postMessage(newState, e.origin);

			state = newState
		}, 100);
	};

	var outputClearTabs = function()
	{
		if (!$('#tabs'))
		{
			$$('#newForm ~ div.column').forEach(function(div){
				div.parentNode.removeChild(div);
			});

			$('#newForm').parentNode.insertBefore(object2Dom({div: {id: 'tab'}}), $('#newForm').nextSibling);
			$('#newForm').parentNode.insertBefore(object2Dom({ul: {id: 'tabs'}}), $('#tab'));
		}
		else
		{
			while ($('#tabs').firstChild)
				$('#tabs').removeChild($('#tabs').firstChild);

			while ($('#tab').firstChild)
				$('#tab').removeChild($('#tab').firstChild);
		}
	};

	this.handleScript = function()
	{
		if ('undefined' != typeof refreshTimer)
			return;

		if ($('#tabs.busy'))
			refreshTimer = setInterval(this.refresh, 1000);

		this.localTime(function(el, d, t){
			el.innerHTML = ' @ '+ d +' '+ t;
		}, 'input + time');
	};

	// Triggered on /new errorpage, eg. title too long
	this.handleNew = function()
	{
		this.richEditor();

		if ($('#tabs.abusive'))
		{
			if ($('#version'))
				$('#version').remove();

			// 2/3d of all js errors from from here, where this.editor is undefined
			if ('undefined' != typeof this.editor)
				this.editor.setReadOnly(true);
		}

		document.body.addEventListener('keydown', function(e){
			// cancel ctrl/cmd+s > prevent browser from saving page
			if (83 == e.which && (e.ctrlKey || e.metaKey))
			{
				e.preventDefault();
				return false;
			}

			if ($('input[type=submit][disabled]') || 13 != e.keyCode)
				return;

			var event = new Event('submit', {
				'view': window,
				'bubbles': true,
				'cancelable': true
			});
			// None of the handlers called preventDefault.
			if (e.ctrlKey && $('#newForm').dispatchEvent(event))
				$('#newForm').submit();
		}.bind(this));

		// Attempt to reload a preview
		window.onpopstate = this.previewStateLoad.bind(this);
	};

	this.handleRfc = function()
	{
		return this.handleOutput();
	};

	this.handleOutput = function()
	{
		$$('dt').forEach(function(el){
			el.addEventListener('click', function(){ window.location.hash = '#'+ el.id; });
		});

		outputAddExpander();
		outputAddDiff();
		outputAsHtml();
	};

	var outputAddExpander = function()
	{
		if (document.body.classList.contains('touch') || $('#expand'))
			return;

		var hasOverflow = false;
		$$('dd').forEach(function(dd){
			hasOverflow = hasOverflow || dd.scrollHeight>dd.clientHeight;
			hasOverflow = hasOverflow || dd.scrollWidth>dd.clientWidth;
		});

		if (!hasOverflow)
			return;

		$('div#tab').insertBefore(object2Dom({
			a: {
				id: 'expand',
				title: 'expand output',
				i: {
					'class': 'icon-resize-full expand'
				}
			}
		}), $('div#tab').firstChild);

		$('#expand').addEventListener('click', outputExpand);
	};

	var outputExpand = function()
	{
		$('dl').classList.toggle('expand');
		$('a#expand i').classList.toggle('icon-resize-full');
		$('a#expand i').classList.toggle('icon-resize-small');
	};

	var outputAddDiff = function()
	{
		if ($('#diff') || $$('#tab dd').length < 2)
			return;

		$('div#tab').insertBefore(object2Dom({
			a: {
				id: 'diff', title: 'diff output',
				i: {'class': 'icon-tasks'}
			}
		}), $('div#tab').firstChild);

		$('#diff').addEventListener('click', outputDiff);
	};

	var diffDone = false;
	var outputDiff = function()
	{
		var ref = $$('div#tab dt:target + dd');
		ref = ref[0] || $$('div#tab dd:first-of-type')[0];

		$$('div#tab dd').forEach(function (dd){
			if (!dd.hasAttribute('original'))
				dd.setAttribute('original', dd.innerHTML);

			if (diffDone)
				dd.innerHTML = dd.getAttribute('original');
			else if (dd != ref)
			{
				var fragment = document.createDocumentFragment(), node, swap;
				var diff = JsDiff.diffWordsWithSpace(
					ref.hasChildNodes() ? ref.childNodes[0].textContent : '',
					dd.hasChildNodes() ? dd.childNodes[0].textContent : ''
				);

				for (var i=0; i < diff.length; i++)
				{
					if (diff[i].added && diff[i + 1] && diff[i + 1].removed)
					{
						swap = diff[i];
						diff[i] = diff[i + 1];
						diff[i + 1] = swap;
					}

					if (diff[i].removed)
					{
						node = document.createElement('del');
						node.appendChild(document.createTextNode(diff[i].value));
					}
					else if (diff[i].added)
					{
						node = document.createElement('ins');
						node.appendChild(document.createTextNode(diff[i].value));
					}
					else
						node = document.createTextNode(diff[i].value);

					fragment.appendChild(node);
				}

				// No output means childnodes is empty
				if (!dd.hasChildNodes())
					dd.appendChild(fragment);
				else
				{
					dd.childNodes[0].textContent = '';
					dd.insertBefore(fragment, dd.childNodes[0]);
				}
			}
		});

		$('a#diff i').classList.toggle('active');
		diffDone = !diffDone;
	};

	var outputAsHtml = function()
	{
		if ($('#asHtml'))
			return;

		$('div#tab').insertBefore(object2Dom({
			a: {
				id: 'asHtml', title: 'interpret as HTML',
				i: {'class': 'icon-eye-open'}
			}
		}), $('div#tab').firstChild);

		$('#asHtml').addEventListener('click', outputHtml);
	};

	var outputHtml = function() {
		$('a#asHtml i').classList.toggle('active');
		var toggleEnable = $('a#asHtml i').classList.contains('active');

		$$('div#tab dd').forEach(function (dd){
			if (!dd.hasAttribute('original'))
				dd.setAttribute('original', dd.innerHTML);

			if (toggleEnable)
				dd.innerHTML = dd.innerText;
			else
				dd.innerHTML = dd.getAttribute('original');
		});
	};

	var focusVersion = '';
	var focusIsBranch = false;
	this.enableFocus = function() {
		this.fillVersionSelector();

		if ($('#newForm'))
			$('#newForm').addEventListener('submit', this.preview.bind(this));

		// b/c
		if (0 === window.location.hash.indexOf('#focus='))
			window.location.hash = 'v'+ window.location.hash.substr('#focus='.length);

		if (-1 === window.location.hash.indexOf('#v'))
			return;

		// verify the hash is a valid version
		var version = window.location.hash.substr(2), option = $('#version option[value="' + version + '"]');

		if (version.match(/^[.0-9a-z_-]+$/) && option) {
			focusVersion = version;
			focusIsBranch = 'branches' === option.parentElement.label;

			option.setAttribute('selected', 'selected');
			outputHighlightVersion(version)

			// disable live preview when we are focused on another single version
			$('#livePreview').removeAttribute('checked');
		}
	};

	var outputHighlightVersion = function(version)
	{
		$$('#tab dl dt').forEach(function (dt) {
			var dtTitle = dt.textContent;

			// for rfcs
			if (-1 !== dtTitle.indexOf(version))
				dt.setAttribute('id', 'v'+version)
			else if (version.split('.').length === 3)
			{
				var l = version.match(/(\d\.\d.)(\d+)/), vPrefix = l[1], vReleaseStr = l[2];
				var vRelease = Number(vReleaseStr)

				var matches = Array.from(dtTitle.matchAll(/([.\d]+)(?: - ([\d.]+))?/g));
				for (var i = 0; i < matches.length; i++)
				{
					var rangeMin = matches[i][1], rangeMax = matches[i][2];
//					console.log(vPrefix, vRelease, rangeMin.substr(vPrefix.length), rangeMax.substr(vPrefix.length));

					if (
						rangeMin.startsWith(vPrefix) && Number(rangeMin.substr(vPrefix.length)) <= vRelease &&
						rangeMax.startsWith(vPrefix) && Number(rangeMax.substr(vPrefix.length)) >= vRelease
					)
						dt.setAttribute('id', 'v'+version)
				}
			}
		});
	};

	this.fillVersionSelector = function() {
		if (!$('#version'))
			return;

		var select = $('#version');
		var versions = JSON.parse(select.dataset['values']);
		var majors = Object.keys(versions);
		var addOpt = function (g, v){
			var o = document.createElement('option');
			o.setAttribute('value', v);
			o.appendChild(document.createTextNode(v));
			g.appendChild(o);
		};
		var getGroup = function(l){
			var group = $('#version optgroup[label="'+l+'"]');

			if (!group)
			{
				group = document.createElement('optgroup');
				group.label = l;
				select.appendChild(group);
			}

			return group
		}

		// Enforce the order of these
		select.appendChild(object2Dom({'option': {value: '', _text: 'all supported versions'}}));
		select.appendChild(object2Dom({'option': {value: 'eol', _text: '+ include eol (slow)'}}));
		var current = select.appendChild(object2Dom({'optgroup': {label: 'current'}}));
		var branches = select.appendChild(object2Dom({'optgroup': {label: 'branches'}}));

		majors.forEach(function(key, idx) {
			if (key[1] != '.')
				var group = branches
			else
				var group = getGroup((key.substr(-1) === '.') ? key.substr(0, key.length-1) : key);

			if (typeof versions[key] === 'number')
				for (var i = versions[key]; i >= 0; i--)
					addOpt(group, key + i);
			else if (typeof versions[key] === 'object')
				versions[key].forEach(function(v){addOpt(group, key + v);});
			else
				addOpt(group, key + versions[key]);

			// assume there are 3 supported major versions and filter out betas
			if (idx <=2 && key.length === 4)
				addOpt(current, group.firstChild.textContent);
		});

		// Move select to end of form
		$('#newForm').appendChild(select);

		select.addEventListener('change', function(){
			$('input[type=submit]').removeAttribute('disabled');

			focusVersion = $('#version').value;
			focusIsBranch = $('#version').selectedOptions[0].parentNode.label == 'branches';

			outputHighlightVersion(focusVersion)
			document.location.hash = '#v'+ focusVersion;
		});

		$('#newForm').addEventListener('submit', this.preview.bind(this));
	};

	this.preview = function(e)
	{
		if (!$('#version') || $('#version').value == '' || $('#version').value == 'eol')
			return;

		var xhr = new XMLHttpRequest();
		xhr.onload = _refreshFocus;
		xhr.open('post', '/new');
		xhr.setRequestHeader('Accept', 'application/json');

		outputClearTabs();

		// The response takes time; provide feedback about being in progress
		$('#tabs').appendChild(object2Dom({
			li: {
				'class': 'active',
				a: {href: '/#preview', _text: 'Preview'}
			}
		}));

		$('#tab').appendChild(document.createElement('dl'));
		$('#tabs').classList.add('busy');

		// is this required?
		if (this.editor)
			$('textarea[name=code]').value = this.editor.getValue();

		xhr.send(new FormData($('#newForm')));
		e.preventDefault();

		return false;
	};

	this.previewStateLoad = function(e)
	{
		// Not every hash change means there is a valid state to pop
		if (!e.state)
			return;

		if (e.state.code)
			this.editor.setValue(e.state.code, 1);
		if (e.state.version)
			$('#version').value = e.state.version;

		// get results by resubmit / replaceState storing output ?
	};

	this.refresh = function()
	{
		if (!$('#tabs.busy') || refreshCount > 42)
		{
			window.clearInterval(refreshTimer);
			$('#tabs').classList.remove('busy');
			return;
		}

		refreshCount++;

		var xhr = new XMLHttpRequest();
		xhr.onload = _refresh;
		xhr.open('get', window.location.pathname);

		if (document.body.classList.contains('output'))
		{
			xhr.open('get', window.location.pathname+'.json');
			xhr.setRequestHeader('Accept', 'application/json');
			xhr.onload = _refreshOutput;
			xhr.timeout = 500;
		}

		xhr.send();
	};

	var _refresh = function()
	{
		var tab = $('#tab');
		var t = this.responseText.match(/<ul id="tabs"[^>]*>([\s\S]*?)<\/ul>/);
		var r = this.responseText.match(/<div id="tab"[^>]*>([\s\S]*?)<\/div>/);
		if (!t || !r)
			return window.setTimeout(window.location.reload.bind(window.location), 200);

		// We need input.state on #tabs, so use outer
		$('#tabs').outerHTML = t[0];

		tab.innerHTML = r[1];

		document.body.classList.forEach(function(c){
			if ('function' == typeof this[ 'handle'+c.ucFirst() ])
				this[ 'handle'+c.ucFirst() ]();
		}.bind(self));
	};

	var _refreshFocus = function()
	{
		if (this.status == 200)
		{
			try
			{
				var r = JSON.parse(this.responseText);
				var path = '/'+ r.script.short +'#v'+ focusVersion

				if (focusIsBranch)
					path = path.replace('#', '/rfc#');

				history.pushState({code: evalOrg.editor.getValue(), version: focusVersion}, 'focus', path);
				// fix tab-href for aParts below
				$('#tabs li.active a').href = path
			} catch (e) {
				// ignore for now
			}
		}

		return _refreshOutput.bind(this)();
	};

	var _refreshOutput = function()
	{
		$('#tabs').classList.remove('busy');

		if (this.status != 200)
			return alert("unexpected responseCode "+ this.status +": "+ this.statusText);

		try
		{
			var r = JSON.parse(this.responseText);

			if (!r.script)
				throw 'invalid response';
		}
		catch (e)
		{
			return window.setTimeout(window.location.reload.bind(window.location), 200);
		}

		// replace entire value by only current state
		$('#tabs').removeAttribute('class');
		if ('done' != r.script.state)
			$('#tabs').classList.add(r.script.state);

		// Update tab enabled/disabled state
		$$('#tabs li').forEach(function (li) {
			var a = li.firstChild, tab;

			if (li.classList.contains('disabled'))
			{
				tab = a.getAttribute('id');

				if (r.script.tabs[tab])
				{
//console.log('enabling', tab);
					li.classList.remove('disabled');
					li.removeAttribute('title');

					a.setAttribute('href', '/' + r.script.short + '/' + tab + '#output');
				}
			}
			else
			{
				var aParts = a.getAttribute('href').split('/');
				tab = (2 == aParts.length) ? 'output' : aParts[2].split('#')[0];

				if ('undefined' != typeof r.script.tabs[tab] && !r.script.tabs[tab])
				{
//console.log('disabling', tab);
					li.classList.add('disabled');
					li.setAttribute('title', 'not available');

					a.removeAttribute('href');
					a.setAttribute('id', tab);
				}
			}
		});

		var tab = $('#tab'), dl = tab.getElementsByTagName('dl')[0],
			o = dl.getElementsByTagName('dt');

		r.output.forEach(function (n, i) {
			// this is missing <span title="released XXX">
			var nvText = 'Output for ' + n.versions;

			if (o[i] && o[i].textContent == nvText)
				return;

			var ndt = document.createElement('dt'),
				ndd = document.createElement('dd');

			ndt.appendChild(document.createTextNode(nvText));
			ndt.setAttribute('id', 'v' + n.versions.replace(/,/g, ' ').split(' ').shift().replace(/\./g, ''));
			ndt.addEventListener('click', function(){ window.location.hash = '#'+ ndt.id; });

			// json output is also html encoded
			ndd.innerHTML = n.output;

			if (o[i] && n.output == o[i].nextSibling.innerHTML)
			{
//console.log('update', o[i].textContent, 'to', nvText);
				dl.replaceChild(ndt, o[i]);
			}
			else
			{
//console.log('insert', ndt, o[i]?'before':'at the end', o[i]);
				if (!o[i])
				{
					dl.appendChild(ndt);
					dl.appendChild(ndd);
				}
				else
				{
					dl.insertBefore(ndt, o[i]);
					dl.insertBefore(ndd, ndt.nextSibling);
				}
			}
		});

		// When using preview on normal output we need to remove existing results
		while (o.length > r.output.length)
		{
			o[r.output.length].nextSibling.remove();
			o[r.output.length].remove();
		}

		outputAddExpander();
		outputAddDiff();

		if (r.script.state == 'abusive')
			alert('Your script was stopped while abusing our resources');
	};

	var perfAddHeader = function(el, name, sum)
	{
		var m, td, i = document.createElement('i');

		i.className = 'icon-';

		el.addEventListener('click', function(){
			el.classList.toggle('open');
			var row = el;

			while (row = row.nextSibling)
			{
				if (row.classList.contains('header'))
					break;

				row.classList.toggle('open');
			}
		});

		el.className = 'header';
		el.appendChild(td = document.createElement('td')); td.textContent = name; td.insertBefore(i, td.firstChild);
		el.appendChild(td = document.createElement('td')); td.appendChild(document.createTextNode((sum.system / sum.count).toFixed(3)));
		el.appendChild(td = document.createElement('td')); td.appendChild(document.createTextNode((sum.user / sum.count).toFixed(3)));
		el.appendChild(td = document.createElement('td')); td.appendChild(document.createTextNode((sum.memory / sum.count).toFixed(2)));

		if (!sum.success)
			el.setAttribute('data-unsuccessful', '1');

		['system', 'user', 'memory'].forEach(function(type, index){
			m = document.createElement('meter');
			m.setAttribute('value', sum[type] / sum.count);

			for (var k in perfAggregates[type])
				m.setAttribute(k, perfAggregates[type][k]);
				m.setAttribute('optimum', perfAggregates[type]['low']/2);

			el.childNodes[1+index].appendChild(m);
		});
	};

	this.localTime = function(cb, sel)
	{
		sel = sel || 'time';
		cb = cb || function(){};

		$$(sel).forEach(function (el){
			var d = new Date(el.hasAttribute('datetime') ? el.getAttribute('datetime') : el.innerText);
			el.setAttribute('title', d.toString());

			function pad(n){ return ('0'+n).slice(-2); };
			cb(el, d.getFullYear() +'-'+ pad(1+d.getMonth()) +'-'+ pad(d.getDate()), pad(d.getHours()) +':'+ pad(d.getMinutes()) +':'+ pad(d.getSeconds()));
		});
	};

	this.handleIndex = function()
	{
		if (!this.editor)
			return false;

		this.editor.focus();
		this.editor.gotoLine(this.editor.session.getLength());

		this.localTime();
	};

	this.handleLast = function()
	{
		this.localTime(function(el, d, t){
			if (window.location.search.indexOf('mine=1') != -1)
				el.innerHTML = d +' '+ t;
			else
				el.innerHTML = t;
		});
	};

	this.handlePerf = function()
	{
		if (!$('table[data-aggregates]'))
			return false;

		perfAggregates = JSON.parse($('table[data-aggregates]').dataset['aggregates']);
		var version, previous, header, sum = {count: 0, system: 0, user: 0, memory: 0, success: 0};

		// Don't use foreach or cache n.length
		var n = $('#tab table tbody').childNodes;
		for (var i=0, tr=n[i]; i<n.length; tr=n[++i])
		{
			// We modify the Node we traverse, not so smart...
			if (tr.querySelector('meter'))
				continue;

			version = tr.firstChild.textContent.substr(0,4).replace(/\.$/, '');

			if (version != previous)
			{
				if (previous)
				{
					perfAddHeader(header, previous, sum);
					sum = {count:0, system: 0, user: 0, memory: 0, success: 0};
				}

				header = tr.parentNode.insertBefore(document.createElement('tr'), tr);
			}

			sum.count++;
			sum.system += parseFloat(tr.childNodes[1].textContent);
			sum.user   += parseFloat(tr.childNodes[2].textContent);
			sum.memory += parseFloat(tr.childNodes[3].textContent);
			sum.success = sum.success || !tr.hasAttribute('data-unsuccessful');

			['system', 'user', 'memory'].forEach(function(type, index){
				var m = document.createElement('meter');
				m.setAttribute('value', tr.childNodes[1+index].textContent);
				m.setAttribute('optimum', perfAggregates[type]['low']/2);

				for (var k in perfAggregates[type])
					m.setAttribute(k, perfAggregates[type][k]);

				tr.childNodes[1+index].appendChild(m);
			});

			previous = version;
		}

		// Process last entry
		perfAddHeader(header, previous, sum);
	};

	this.handleSearch = function()
	{
		$('#query').focus();

		$('#searchForm').addEventListener('submit', function(e){
			e.preventDefault();

			var url = '/search/'+ encodeURIComponent($('#query').value);
			window.location.href = url;
		});

		if (!$('div#tagCloud'))
			this.localTime(function(el, d, t){
				el.innerHTML = d +' '+ t;
			});
	};

	this.handleBughunt = function()
	{
		if ($('#bughuntForm'))
		{
			$('#bughuntForm').addEventListener('submit', function (e) {
				e.preventDefault();

				window.location.href = '/bughunt/'
					+ $('#versions').getSelected().join('+')
					+ '/' + $('#controls').getSelected().join('+');
			});
		}
		else
		{
			this.localTime(function(el, d, t){
				el.innerHTML = d +' '+ t;
			});
		}
	};

	this.handleVersions = function()
	{
		tableSorter.initialize();
	};

	// this function is based on jslinux.js - Copyright (c) 2011-2017 Fabrice Bellard
	var _launchVm = function(cmdline)
	{
		/* Module is used by x86emu - update_downloading is a callback */
		window.Module = {};
		window.update_downloading = function(flag)
		{
			var tabClass = document.getElementById('tabs').classList;
			var downloading_timer;

			if (flag) {
				if (tabClass.contains('busy')) {
					clearTimeout(downloading_timer);
				} else {
					tabClass.add('busy');
				}
			} else {
				downloading_timer = setTimeout(function(){ tabClass.remove('busy'); }, 500);
			}
		};

		var url = $('#live_preview').dataset.cfg;
		var mem_size = 128; /* in mb */

		window.liveTiming = new Date().getTime();
		window.term = new function(w, h){
			this.cleared = true;

			this.getSize = function(){
				return [80, 999];
			};
			this.write = function(s){
//console.log("myTerm.write", this.cleared, escape(s));
				if (window.liveTiming)
				{
					var xhr = new XMLHttpRequest();
					xhr.open('post', '/live-timing/'+ encodeURIComponent(new Date().getTime() - window.liveTiming));
					xhr.send();
					delete window.liveTiming;
				}

				// live output might have been replaced by quick output
				if (!$('#live_preview'))
					return;

				if (s == String.fromCharCode(27) + String.fromCharCode(91) + 'H' + String.fromCharCode(27) + String.fromCharCode(91) + 'J')
				{
					while ($('#live_preview').firstChild)
						$('#live_preview').removeChild($('#live_preview').firstChild);

					this.cleared = true;
					return;
				} else if (this.cleared && s == '\r\n') //FIXME find out who prints this
					return this.cleared = false;

				$('#live_preview').appendChild(document.createTextNode(s));
				$('#tabs').classList.remove('busy');
			};
		};

		Module.preRun = function()
		{
			/* C functions called from javascript */
			window.console_write1 = Module.cwrap('console_queue_char', null, ['number']);
			window.fs_import_file = Module.cwrap('fs_import_file', null, ['string', 'number', 'number']);
			window.display_key_event = Module.cwrap('display_key_event', null, ['number', 'number']);
			window.display_mouse_event = Module.cwrap('display_mouse_event', null, ['number', 'number', 'number']);
			window.display_wheel_event = Module.cwrap('display_wheel_event', null, ['number']);
			window.net_write_packet = Module.cwrap('net_write_packet', null, ['number', 'number']);
			window.net_set_carrier = Module.cwrap('net_set_carrier', null, ['number']);

			Module.ccall('vm_start', null, ['string', 'number', 'string', 'string', 'number', 'number', 'number', 'string'], [url, mem_size, cmdline||'', '', 0, 0, 0, '']);
		};

		if (typeof WebAssembly !== 'object')
		{
			/* set the total memory */
			var alloc_size = mem_size;
			alloc_size += 16;
			alloc_size += 32; /* extra space (XXX: reduce it ?) */
			alloc_size = (alloc_size + 15) & -16; /* align to 16 MB */
			Module.TOTAL_MEMORY = alloc_size << 20;

			loadScript('/live/x86emu.js');
		} else
			loadScript('/live/x86emu-wasm.js');
	};

	this.handleSponsor = function()
	{
		var now = new Date().getFullYear();
		var offset = (new Date).setMonth((new Date).getMonth() - 12);

		$$('ul li i').forEach(function (el){
			var d = new Date(el.textContent).getFullYear();

			el.parentNode.dataset['age'] = now-d;
			el.parentNode.classList.add(now-d<2 ? 'active' : 'expired');
		});
	};

	this.handleStats = function()
	{
		this.localTime(function(el, d, t){ el.innerHTML = t;}, 'tbody td:nth-child(2)');

		var n = $('table tbody').rows;
		for (var i=0, tr=n[i]; i<n.length; tr=n[++i])
		{
			var p = parseFloat(tr.cells[5].textContent) * parseFloat(tr.cells[6].textContent) * parseFloat(tr.cells[7].textContent);
			tr.cells[0].innerHTML += '<br><span style="color:red">' + Math.round(p / 1000) + ' sec</span>';

			tr.cells[6].textContent = Math.round(tr.cells[6].textContent);
			tr.cells[7].textContent = Math.round(tr.cells[7].textContent);
		}
	};

	var object2Dom = function(node, wrapper)
	{
		// if we get a single top-node; use that as wrapper
		if (typeof wrapper == 'undefined' && 1 == Object.keys(node).length)
		{
			wrapper = Object.keys(node)[0];
			node = node[wrapper];
		}

		var o = document.createElement(wrapper || 'span');

		for (var k in node)
		{
			// to support multiple children with the same tagname, support children:[ {a:{href:'x'}}, {a:{href:'y'}} ]
			if (k == 'children' && Array.isArray(node[k]))
				for (var kk in node[k])
					o.appendChild(object2Dom(node[k][kk]));
			else if ("object" == typeof node[k])
				o.appendChild(object2Dom(node[k], k));
			else if ("_text" == k)
				o.appendChild(document.createTextNode(node[k]));
			else
				o.setAttribute(k, node[k]);
		}

		return o;
	};

	// Possibility to apply css before onload gets fired (which is after parsing ace.js)
	document.body.classList.add('js');

	if ('ontouchstart' in window)
		document.body.classList.add('touch');
	if (navigator.userAgent.match(/(Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile)/))
		document.body.classList.add('mobile');

	evalOrg.initialize();

	if ('serviceWorker' in navigator)
		navigator.serviceWorker.register('/pwa-worker.js');
}).apply(evalOrg);
