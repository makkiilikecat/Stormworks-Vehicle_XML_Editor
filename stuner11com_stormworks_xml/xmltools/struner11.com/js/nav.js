//$(getNavMap);
getNav()
function getNavMap(mainnav) {
	$.ajax({
		url: "/js/navmap.json",
		dataType: "json"
	}).done(function(data) {
		getNavBranch(data, mainnav);
	});
}

function getNav() {
	/* main navbar */
	let nav = $('<nav/>', {
		class: 'navbar navbar-expand-lg navbar-dark bg-dark',
		id: 'navbar-main'
	}).prependTo('body');
	/* brand */
	$('<a/>', {
		class: 'navbar-brand',
		href: '/'
	}).html("struner11").appendTo(nav);
	/* collapse button */
	$('<button/>', {
		class: 'navbar-toggler',
		type: 'button',
		'data-toggle': 'collapse',
		'data-target': '#nav-collapse'
	}).html('<span class="navbar-toggler-icon"></span>').appendTo(nav);

	/* collapse div */
	let navcollapse = $('<div/>', {
		class: 'collapse navbar-collapse',
		id: 'nav-collapse'
	}).appendTo(nav);
	let mainnav = $('<ul/>', {
		class: 'navbar-nav'
	}).appendTo(navcollapse);
	getNavMap(mainnav);
}

function getNavBranch(mapdata, mainnav) {
	if (!mapdata.root) return;
	const root = mapdata.root;
	const rootlength =root.length
	for (let i = 0; i < rootlength; i++) {
		const branch = root[i];
		let li =  $('<li/>', {
			class: 'nav-item'
		}).appendTo(mainnav);
		let a = $('<a/>', {
			class: 'nav-link'
		}).html(branch.title).appendTo(li);
		if (branch.subs.length > 0) {
			li.addClass('dropdown');
			a.addClass('dropdown-toggle').attr({
				role: 'button',
				'data-toggle': 'dropdown'
			});
			let dropdownmenu = $('<div/>', {
				class: 'dropdown-menu'
			}).appendTo(li);
			for (let z = 0; z < branch.subs.length; z++) {
				const sub = branch.subs[z];
				$('<a/>', {
					class: 'dropdown-item',
					href: sub.url
				}).html(sub.title).appendTo(dropdownmenu);
			}
		} else {
			a.attr('href', branch.url)
		}
	}
}