var fs = require('fs');
var _ = require('lodash');
var Storage = require('slack-helperbot/storage');

const KEY = 'diplomacy_game';
const ACTIONS = ['defend', 'attack', 'support', 'invest'];
const STARTING_POINTS = 100;
const TICK_RATE = 1000; //1 sec for now
const ATTACK_RATIO = 0.5;

const INVEST_START = 10;
const INVEST_RATE = 2;

//Use to easily retrieve and modify game state
var Game = function(args){
	if(args){
		Storage.set(KEY, _.extend({}, Storage.get(KEY), args));
	}
	return Storage.get(KEY)
};


var tickTimer;







var DiplomacyEngine = {
	gameState : Game,

	newRoundHandler : function(){},

	startGame : function(initiator, roundLength, roundCount){
		Game({
			initiator : initiator,
			players : [],
			investPool : INVEST_START,
			scores : {},
			moves : {},
			currentRound : 1,
			currentTick : 0,

			roundResults : {},

			config : {
				roundTickLength : 5,
				investRate : INVEST_RATE,
				totalRounds : 3
			}
		});

		DiplomacyEngine.newRoundHandler({round : 0});

		//DiplomacyEngine.startTimer();
	},
	endGame : function(){
		console.log('END GAME');

		var roundState = DiplomacyEngine.calculateRound();
		roundState.round = Game().config.totalRounds;
		DiplomacyEngine.newRoundHandler(roundState);

		clearInterval(tickTimer);
		tickTimer = null;
		Storage.set(KEY, null);
	},
	isRunning : function(){
		return !!Storage.get(KEY);
	},


	newRound : function(){
		var roundState = DiplomacyEngine.calculateRound();

		Game({
			currentTick : 0,
			moves : {},

			currentRound : Game().currentRound + 1,
			investPool : Game().investPool + Game().config.investIncrement,

		});

		if(Game().currentRound > Game().config.totalRounds){
			return DiplomacyEngine.endGame();
		}

		console.log('NEW ROUND', Game().currentRound);


		DiplomacyEngine.newRoundHandler(roundState);

		//check for end of game

	},

	startTimer : function(){
		if(!tickTimer){
			tickTimer = setInterval(function(){
				if(!DiplomacyEngine.isRunning()) return;
				Game({currentTick : Game().currentTick + 1});

				console.log('TICK', Game().currentTick);

				if(Game().currentTick >= Game().config.roundTickLength){
					DiplomacyEngine.newRound();
				}
			}, TICK_RATE);
		}
	},


	addPlayer : function(name){
		var temp = Game();
		temp.players.push(name);
		temp.scores[name] = STARTING_POINTS;
		Game(temp);
	},
	submitMove : function(name, action, target){
		var temp = Game();
		temp.moves[name] = {
			action : action,
			target : target
		};
		Game(temp);
	},



	///////

	getPlayersByAction : function(actionType){
		return _.reduce(Game().moves, (r, move, player)=>{
			if(move.action == actionType) r.push(player);
			return r;
		}, []);
	},

	getSupporterCount : function(player){
		return DiplomacyEngine.getSupporters(player).length;
	},
	getSupporters : function(player){
		return _.reduce(Game().moves, (r, move, supportingPlayer)=>{
			if(move.action == 'support' && move.target == player) r.push(supportingPlayer);
			return r;
		}, []);
	},
	getDefenseValue : function(player){
		var move = Game().moves[player];
		if(move.action == 'invest') return 0;
		if(move.action == 'attack') return 1;
		if(move.action == 'support') return 1;
		if(move.action == 'defend') return DiplomacyEngine.getSupporterCount(player) + 1;
	},
	getAttackValue : function(player){
		var move = Game().moves[player];
		if(move.action == 'invest') return 0;
		if(move.action == 'defend') return 0;
		if(move.action == 'support') return 0;
		if(move.action == 'attack') return DiplomacyEngine.getSupporterCount(player) + 1;
	},

	setDefaultActions : function(){
		_.each(Game().players, (player)=>{
			if(!Game().moves[player]) Game().moves[player] = {};
			if(!Game().moves[player].action) Game().moves[player].action = 'defend';
		})
		Game({ moves : Game().moves });

		console.log('DEFAULT', Game().moves);
	},


	calculateRound : function(){
		DiplomacyEngine.setDefaultActions();
		var state = {
			round : Game().currentRound
		};

		//Build initial state
		_.each(Game().players, (player)=>{
			state[player] = {
				action     : Game().moves[player].action,
				target     : Game().moves[player].target,
				supporters : DiplomacyEngine.getSupporters(player)
			}
		});

		state = DiplomacyEngine.calculateInvests(state);
		state = DiplomacyEngine.calculateAttacks(state);

		DiplomacyEngine.updateScores(state);

		Game({ roundResults : state });

		return state;
	},


	calculateInvests : function(state){
		var investPlayers = DiplomacyEngine.getPlayersByAction('invest');
		//Split pool evenly
		_.each(investPlayers, (player)=>{
			state[player].invest = Math.floor(Game().investPool/investPlayers.length);
		});
		//Reset the pool if anyone took investment
		if(investPlayers.length){
			Game({investPool : 0 })
		}
		return state;
	},

	calculateAttacks : function(state){
		var attackPlayers = DiplomacyEngine.getPlayersByAction('attack');
		//Calculate successes/failures
		var atkList = {};
		_.each(attackPlayers, (atkPlayer)=>{
			var target = state[atkPlayer].target;
			if(DiplomacyEngine.getAttackValue(atkPlayer) > DiplomacyEngine.getDefenseValue(target)){
				state[atkPlayer].isSuccessful = true;
				state[target].isSuccessful = false;

				//Make a list of successful attacks keyed by target
				if(!atkList[target]) atkList[target] = [];
				atkList[target].push(atkPlayer);
			}else{
				state[atkPlayer].isSuccessful = false;
				state[target].isSuccessful = true;
			}
		});

		//Update gains and loses
		_.each(atkList, (attackers, target)=>{
			var lossValue = Math.floor(Game().scores[target] * ATTACK_RATIO);
			state[target].loss = lossValue;
			//Split gain evenly between attackers
			_.each(attackers, (attacker)=>{
				state[attacker].gain = Math.floor(lossValue/attackers.length);
			});
			//Steal investment if they were investing
			if(state[target].action == 'invest'){
				var investValue = state[target].invest;
				state[target].invest = 0;
				//Split invest evenly between attackers
				_.each(attackers, (attacker)=>{
					state[attacker].stole = Math.floor(investValue/attackers.length);
				});
			}
		});

		return state;
	},

	updateScores : function(state){
		var scores = Game().scores;
		_.each(state, (res, player)=>{
			scores[player] += (res.gain || 0) + (res.stole || 0) + (res.invest || 0);
			scores[player] -= (res.loss || 0);
		})
		Game({ scores : scores });
	},



}



//Server restart timer code
if(DiplomacyEngine.isRunning()){
	DiplomacyEngine.startTimer();
}




module.exports = DiplomacyEngine;


/*
dip.addPlayer('Agatha');
dip.addPlayer('Bathalsar');
dip.addPlayer('Cain');
dip.addPlayer('Dahlia');

dip.submitMove('Bathalsar', 'support', 'Agatha');
dip.submitMove('Agatha', 'attack', 'Dahlia');
dip.submitMove('Cain', 'attack', 'Dahlia');
dip.submitMove('Dahlia', 'invest');


//dip.submitMove('Cain', 'invest');
//dip.submitMove('Dahlia', 'support', 'Cain');


console.log(dip.calculateRound());

console.log(investEarnings);

//console.log('Defense', dip.calculateDefenses());
//console.log('Attack', dip.calculateAttack());
*/