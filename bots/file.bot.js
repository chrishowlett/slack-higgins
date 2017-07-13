const Slack = require('pico-slack');
const config = require('nconf');
const _ = require('lodash');

let files = [];
let msgId = false;


Slack.onMessage((msg)=>{
	if(!Slack.msgHas(msg.text, 'higgins', 'clean house')) return;

	Slack.msg(msg.channel, '_Sure, give me a sec_');

	getAllFiles()
		.then((res)=>{
			files = res;
			Slack.msg(msg.channel, `I found ${files.length} files that I can delete. React with a thumbs up to this message to let me know I can delete them`)
				.then((res)=>{
					msgId = res.message.ts;
				})
		})

})


Slack.onReact((msg)=>{
	if(msg.item.ts == msgId){
		Slack.msg(msg.channel, '_Got it, This might take a while..._');
		msgId = false;
		Promise.all(_.map(files, (file)=>deleteFile(file)))
			.then(()=>{
				Slack.msg(msg.channel, `_Whew, all done! ${files.length} deleted!`);
				files = [];
			});
	}
})

const deleteFile = (fileId)=>{
	return new Promise((resolve, reject)=>{
		Slack.api('files.delete', {token : config.get('command_token'), file:fileId})
			.then(()=>{
				setTimeout(()=>resolve(), 100);
			})
			.catch(()=>resolve())
	});
}

const getAllFiles = ()=>{
	let result = [];

	const getFiles = (page=1)=>{
		return Slack.api('files.list', {token : config.get('command_token'), page:page})
			.then((res)=>{
				result = _.concat(result, _.map(res.files, (file)=>file.id));
				if(res.paging.pages > page) return getFiles(page + 1);

				return result
			})
	}
	return getFiles();
}