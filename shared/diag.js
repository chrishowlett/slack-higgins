var _ = require('lodash');
var request = require('superagent');

var diagnosticsURL = process.env.DIAGNOSTICS_WEBHOOK;



module.exports = {

	//green
	info : function(){

	},

	//blue
	log : function(){

	},

	//red
	error : function(){

	},

	//yellow
	warn : function(){

	},


	msg : function(){
		var args = Array.prototype.slice.call(arguments, 1);
		var res = _.map(args, function(arg){
			return JSON.stringify(arg);
		}).join(', ');
		request.post(diagnosticsURL)
			.send({
				"text" : res
			});
	},

}

/*{

			"text": text,

			"color": "#36a64f", // Can either be one of 'good', 'warning', 'danger', or any hex color code

			// Fields are displayed in a table on the message

			"fields": [
				{
					"title": "Command Fired", // The title may not contain markup and will be escaped for you
					"value": "Text value of the field. May contain standard message markup and must be escaped as normal. May be multi-line.",
					"short": false // Optional flag indicating whether the `value` is short enough to be displayed side-by-side with other values
				}
			]

		}
		*/