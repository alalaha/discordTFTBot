const { prefix, token } = require('./config.json');
const Discord = require('discord.js');
const client = new Discord.Client();

client.once('ready', () => {
	console.log('Ready!');
});

client.login(token);

client.on('message', message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

	if (command === tournament) {
        // send back "Pong." to the channel the message was sent in
        if(args[0] === null) {
            message.channel.send('The first tournament of Set 4 will take place Saturday, September 26. Prizing details will be posted soon.');
        } else if (args[0] === participants) {
            let result = 'Registered: ';
            participants.forEach(participant => {
                result = result + participant + ' ';
            });
        } else if (args[0] === register) {
            participants.push(message.author.username);
            message.channel.send(message.author.username + ', you are now registered for the tournament!');
        } else if (args[0] === unregister) { 
            let check = false;
            for (let i = 0; i < participants.length; i++) {
                if (participants[i] === message.author.username) {
                    check = true;
                    participants.splice(i, 1);
                }
            }
            if (check) {
                message.channel.send('You have successfully been unregistered, ' + message.author.username + '!');
            } else {
                message.channel.send('You are not registered yet, ' + message.author.username + '.');
            }
        }
    }
    if (command === summon) {
        // send back "Pong." to the channel the message was sent in
        message.channel.send(':HandsUp:');
    }
});

//Array for tournament participants
let participants = [];