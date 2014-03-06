var fs = require('fs'),
	http = require('http'),
	url = require("url"),
	pilight = require('../node-pilight/pilight'),
	gpio = require("gpio"),
	Q = require('q'),
	osc = require('node-osc'),
	connect = require('connect'),
	requireio = require('socket.io');

var controllersConfigFilePath = './public/controllers.json',
	everflourishProtocolFilePath = '../node-pilight/protocols/everflourish-EMWT200T_EMW201R.json',
	kakuConfigFilePath = '../node-pilight/config/kaku.json',
	dmxcontroler = {
		host : '192.168.54.235',
		port : 12345
	}

var qPins = Q.defer();

fs.readFile(controllersConfigFilePath, function (err, data) {
	if (err) throw err;
	qPins.resolve(JSON.parse(data));

	/*
		Pins should be defined in the following format:
		[
		// dimmer
			{
				number: 23,
				control : 'kaku',
				unit : '1',
				upDate : Date.now(),
				dimming : false
			},
		// switch
			{
				number: 23,
				control : 'everflourish',
				unit : 'A1'
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
	function (controllers, everflourish, kaku){

		console.log('Config files read');

		io = requireio.listen(8082);
		io.sockets.on('connection', function (socket) {
			socket.on('controller', function (data) {
				console.log(data);
				var controller = controllers[data.controller];
				if (controller) {
					if (controller.control === 'kaku') {
						watchKakuPin(controller, data.value);
					}
					else if (controller.control === 'everflourish') {
						watchEverflourishPin(controller, data.value);
					}
					else if (controller.control === 'osc') {
						watchOscPin(controller, data.value);
					}						
				}
			});
		});

		console.log('Websocket server started on port 8082'); 

		var sendEverflourish = function(unit, state){
			var thisDefer = Q.defer();
			var onoff = state ? 'on' : 'off';
			var messageContent = {
				message: 'send',
				code: {
					protocol:  [ 'raw' ],
					code: everflourish[unit][onoff]
				}
			}
			pilight.send(messageContent).then(function(){
				thisDefer.resolve();
			});
			return thisDefer.promise;
		}

		var sendKakuSwitch = function(unit, state){
			var thisDefer = Q.defer();
			var onoff = state ? 'on' : 'off';
			var messageContent = {
				message: 'send',
				code: JSON.parse(JSON.stringify(kaku))
			}
			messageContent.code['protocol'] = ['kaku_switch'];
			messageContent.code['unit'] = unit;
			messageContent.code[onoff] = 1;
			pilight.send(messageContent).then(function(){
				thisDefer.resolve();
			});
			return thisDefer.promise;
		}

		/*
		  Dimmer logic
		*/
		var controllerToggleKaku = function(controller){
			sendKakuSwitch(parseInt(controller.unit), !controller.state);
			controller.state = !controller.state;
			controller.dimming = false;
		}
		var controllerDimKaku = function(controller){
			if ((typeof(controller.state) === 'undefined') || (controller.state === false)) {
				sendKakuSwitch(parseInt(controller.unit), true).then(function(){
					setTimeout(function(){
						if (controller.dimming) {
							sendKakuSwitch(parseInt(controller.unit), true);
						}
					},1000)
				});
			}
			else {
				sendKakuSwitch(parseInt(controller.unit), true);
			}
			controller.state = true;
			controller.dimming = true;
		}
		var controllerDimKakuStop = function(controller){
			if (controller.dimming) {
				sendKakuSwitch(parseInt(controller.unit), true);
				controller.state = true;
			}
			controller.dimming = false;
		}

		var watchKakuPin = function(controller, value){
			value = parseInt(value);

			if (value === 1) {
				controller.upDate = Date.now();
				controller.timeout = setTimeout(function(){
					controllerDimKaku(controller);
				},1000);
			}
			else if (value === 0) {
				clearTimeout(controller.timeout);
				var dateDiff = Date.now() - controller.upDate;

				if (dateDiff < 1000) {
					controllerToggleKaku(controller)
				}
				else {
					controllerDimKakuStop(controller);
				}
			}
		}

		/*
		  Switch logic
		*/
		var watchEverflourishPin = function(controller, value){
			value = parseInt(value);
			if (value === 0) {
				sendEverflourish(controller.unit, !controller.state);
				controller.state = !controller.state;
			}
		}

		/*
		  Osc logic
		*/
		var watchOscPin = function(controller, value){
			console.log(value);
			dmxcontrolerClient.send('/touch' + controller.color, value);
		}

		/*
		  Initialize controllers listeners
		*/

		console.log('Initializing controllers listeners');

		var pins = {};

		for (var controller in controllers) {

			pins[controllers[controller].number] = controllers[controller];

			var thisInput = gpio.export(parseInt(controllers[controller].number), {direction: "in"});
			thisInput.on("change", function(value) {

				var thisPin = pins[this.headerNum];
				console.log(thisPin.number + ':' + value);
				if (thisPin.control === 'kaku') {
					watchKakuPin(thisPin, value);
				}
				else if (thisPin.control === 'everflourish') {
					watchEverflourishPin(thisPin, value);
				}
				else if (thisPin.control === 'osc') {
					watchOscPin(thisPin, value);
				}
			});
		}

		/*
			Digital interface
		*/

		var app = connect()
			.use(connect.static('public'))
			.use(connect.bodyParser())
			.use(function(req, res){
				res.end('');
			})

		console.log('Server started');

		http.createServer(app).listen(8080);

	},
	function (reason) {
		console.log('Configuration files not read: ' + reason)
	}
);
