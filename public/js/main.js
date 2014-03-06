	var socket = io.connect('http://192.168.54.26:8082');

  socket.on('controller', function (data) {
  	console.log(controller);
  });

	Snap.load("media/model.svg", function (f) {

		var s = Snap("#svgmodel");
		var shadowFilter = s.filter(Snap.filter.shadow(0, 5, 8, 'rgba(0,0,0,0.2)'));

		var bgs = [
			'p1bg',
			'p2bg',
			'p3bg',
			'bottombg'
		];

		bgs.forEach(function(bg){
			var $bg = f.select('#' + bg);
			var $bgH = Snap('#' + bg + 'H');

			var dimensions = {};

			if ($bg.type === 'path') {
				var bgBBox = Snap.path.getBBox($bg);
				dimensions.left = bgBBox.x + 'px';
				dimensions.top = bgBBox.y + 'px';
				dimensions.width = bgBBox.width + 'px';
				dimensions.height = bgBBox.height + 'px';
			}
			else if ($bg.type === 'rect') {
			console.log($bg.node);
				dimensions.left = $bg.node.x.baseVal.value + 'px';
				dimensions.top = $bg.node.y.baseVal.value + 'px';
				dimensions.width = $bg.node.width.baseVal.value + 'px';
				dimensions.height = $bg.node.height.baseVal.value + 'px';
			}

			var bgHStyle = '';
			bgHStyle += 'left:' + dimensions.left;
			bgHStyle += ';top:' + dimensions.top;
			bgHStyle += ';width:' + dimensions.width;
			bgHStyle += ';height:' + dimensions.height;
/*
			$bg.attr({
			    filter: shadowFilter
			});
*/
			$bgH.attr({
			    style: bgHStyle
			});
		})

		var $body = Snap.select("body");
		var controllers = f.selectAll("path[id^=p1p], path[id^=p2p], path[id^=p3p]");

		controllers.forEach(function(controller){
			controller.mousedown(function(ev){
				$body.attr({
					class: 'mousedown'
				});
				var id = ev.target.id;
				var el = Snap.select("#" + id);
				el.attr({
					class: 'clicked'
				})
		    socket.emit('controller', {
					controller: id,
					value:1
				});
			})
			controller.mouseup(function(ev){
				$body.attr({
					class: ''
				});
				var id = ev.target.id;
				var el = Snap.select("#" + id);
				el.attr({
					class: ''
				})
		    socket.emit('controller', {
					controller: id,
					value:0
				});
			})
		})
		s.append(f);


	});