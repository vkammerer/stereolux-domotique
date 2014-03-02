var fs = require('fs'),
	pilight = require('../node-pilight/pilight'),
	Gpio = require('onoff').Gpio,
	Q = require('q'),
	osc = require('node-osc'),
	connect = require('connect');

var pinsConfigFilePath = './pins.json',
	everflourishProtocolFilePath = '../node-pilight/protocols/everflourish-EMWT200T_EMW201R.json',
	kakuConfigFilePath = '../node-pilight/config/kaku.json',
	dmxcontroler = {
		host : '192.168.51.227',
		port : 9000
	}

var qPins = Q.defer();

	console.log('pins');

fs.readFile(pinsConfigFilePath, function (err, data) {
	if (err) throw err;
	qPins.resolve(JSON.parse(data));

	/*
		Pins should be defined in the following format:
		[
		// dimmer
			{
				number: 23,
				control : 'kaku',
				plugunit : '1',
				upDate : Date.now(),
				dimming : false
			},
		// switch
			{
				number: 23,
				control : 'everflourish',
				plugunit : 'A1'
			},
		// osc
			{
				number: 23,
				control : 'osc',
				color : 'red'
			}
		]
	*/

});

var qEverflourish = Q.defer();

fs.readFile(everflourishProtocolFilePath, function (err, data) {
	if (err) throw err;
	qEverflourish.resolve(JSON.parse(data));
});

var qKaku = Q.defer();

fs.readFile(kakuConfigFilePath, function (err, data) {
	if (err) throw err;
	qKaku.resolve(JSON.parse(data));
});

var dmxcontrolerClient = new osc.Client(dmxcontroler.host, dmxcontroler.port);

Q.all([qPins.promise, qEverflourish.promise, qKaku.promise]).spread(
	function (pins, everflourish, kaku){

		var sendEverflourish = function(ref, status){
			var thisDefer = Q.defer();
			var onoff = status ? 'on' : 'off';
			var messageContent = {
				message: 'send',
				code: {
					protocol:  [ 'raw' ],
					code: everflourish[ref][onoff]
				}
			}
			pilight.send(messageContent).then(function(){
				thisDefer.resolve();
			});
			return thisDefer.promise;
		}

		var sendKakuSwitch = function(ref, status){
			var thisDefer = Q.defer();
			var messageContent = {
				message: 'send',
				code: JSON.parse(JSON.stringify(kaku))
			}
			messageContent.code['unit'] = ref;
			var onoff = status ? 'on' : 'off';
			messageContent.code[onoff] = onoff;
			pilight.send(messageContent).then(function(){
				thisDefer.resolve();
			});
			return thisDefer.promise;
		}

		var sendKakuDimmer = function(ref,dimlevel){
			var thisDefer = Q.defer();
			var messageContent = {
				message: 'send',
				code: JSON.parse(JSON.stringify(kaku))
			}
			messageContent.code['unit'] = ref;
			messageContent.code['dimlevel'] = dimlevel.toString();
			pilight.send(messageContent).then(function(){
				thisDefer.resolve();
			});
			return thisDefer.promise;
		}

		/*
		  Dimmer logic
		*/
		var pinToggleKaku = function(pin){
			sendKakuSwitch(pin.plugunit, !pin.state);
			pin.state = !pin.state;
			pin.dimming = false;
		}
		var pinDimKaku = function(pin){
			if ((typeof(pin.state) === 'undefined') || (pin.state === false)) {
				sendKakuSwitch(pin.plugunit, true).then(function(){
					setTimeout(function(){
						if (pin.dimming) {
							sendKakuSwitch(pin.plugunit, true);
						}
					},1000)
				});
			}
			else {
				sendKakuSwitch(pin.plugunit, true);
			}
			pin.state = true;
			pin.dimming = true;
		}
		var pinDimKakuStop = function(pin){
			if (pin.dimming) {
				sendKakuSwitch(pin.plugunit, true);
				pin.state = true;
			}
			pin.dimming = false;
		}

		var watchKakuPin = function(pin, value){

			if (value === 1) {
				pin.upDate = Date.now();
				pin.timeout = setTimeout(function(){
					pinDimKaku(pin);
				},1000);
			}
			else if (value === 0) {
				clearTimeout(pin.timeout);
				var dateDiff = Date.now() - pin.upDate;

				if (dateDiff < 1000) {
					pinToggleKaku(pin)
				}
				else {
					pinDimKakuStop(pin);
				}
			}
		}

		/*
		  Switch logic
		*/
		var watchEverflourishPin = function(pin, value){
			if (value === 0) {
				sendEverflourish(pin.plugunit, !pin.state);
				pin.state = !pin.state;
			}
		}

		/*
		  Osc logic
		*/
		var watchOscPin = function(pin, value){
			oscClient.send('/touch' + pin.color, value);
		}

		/*
		  Initialize pins listeners
		*/
		pins.forEach(function(pin){
			var thisInput = new Gpio(parseInt(pin.number), 'in', 'both', {persistentWatch: true});
			thisInput.watch(function(err, value) {
				console.log(value);
				if (pin.control === 'kaku') {
					watchKakuPin(pin, value);
				}
				else if (pin.control === 'everflourish') {
					watchEverflourishPin(pin, value);
				}
				else if (pin.control === 'osc') {
					watchOscPin(pin, value);
				}
			});
		})

		/*
		  Digital interface
		*/
		connect.createServer(
			connect.static(__dirname + '/public')
		).listen(8080);

	},
	function (reason) {
		console.log('Configuration files not read: ' + reason)
	}
);
