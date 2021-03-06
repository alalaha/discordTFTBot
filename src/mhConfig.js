require('dotenv').config();

const AWS = require('aws-sdk');
const { IdentityStore } = require('aws-sdk');
AWS.config.update({
    region: process.env.AWS_DEFAULT_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})
const docClient = new AWS.DynamoDB.DocumentClient();

const {findSummonerIds, matchListTft, userLeagueTft, matchDetailsTft} = require('./riotApi.js');

let throttle = 10;

module.exports = {
    addFullMatchDetails: async function (matchId) {
        matchInDatabase = await module.exports.containsFullMatchDetails(matchId);

        if (matchInDatabase) {
            return module.exports.getFullMatchDetails(matchId);
        }

        matchDetailsResponse = await matchDetailsTft(matchId);
        fullMatchInfo = matchDetailsResponse.response.info;

        const game_datetime = fullMatchInfo.game_datetime;
        let date = new Date(game_datetime);
        // Get time in EST
        const game_date_obj = new Date(date.getTime() - 5 * 60 * 60 * 1000);
        const month = game_date_obj.getUTCMonth() + 1;
        const day = game_date_obj.getUTCDate();
        const year = game_date_obj.getUTCFullYear();
        const hour = game_date_obj.getUTCHours();
        const minute = game_date_obj.getUTCMinutes();

        const formattedTime = `${month}/${day}/${year} ${hour}:${minute}`;

        // Find patch
        const game_version = fullMatchInfo.game_version;
        const afterReleases = game_version.substring(game_version.search('Releases/') + 9);
        let game_patch;
        if (!isNaN(parseInt(afterReleases.charAt(4), 10))) {
            game_patch = afterReleases.substring(0, 5);
        } else {
            game_patch = afterReleases.substring(0, 4);
        }

        // Find game type
        const queue_id = fullMatchInfo.queue_id;
        let game_type;
        if (queue_id == 1090) {
            game_type = 'Normal';
        } else if (queue_id == 1100) {
            game_type = 'Ranked';
        } else {
            game_type = undefined;
        }

        const tft_set_number = fullMatchInfo.tft_set_number;

        // Insert relevant player info
        let playerMap = new Map();
        fullMatchInfo.participants.forEach((player) => {
            let traits = [];
            player.traits.forEach((trait) => {
                traits.push({
                    name: trait.name,
                    num_units: trait.num_units,
                    tier_current: traits.tier_current,
                    tier_total: traits.tier_total,
                });
            });

            let units = [];
            player.units.forEach((unit) => {
                units.push({
                    character_id: unit.character_id,
                    items: unit.items,
                    tier: unit.tier,
                    chosen: unit.chosen,
                });
            });
            
            let playerInfo = {
                placement: player.placement,
                level: player.level,
                gold_left: player.gold_left,
                time_eliminated: player.time_eliminated,
                last_round: player.last_round,
                traits: traits,
                units: units,
            }

            playerMap.set(player.puuid, playerInfo);
        });

        const info = {
            game_datetime: formattedTime,
            game_patch,
            game_type,
            tft_set_number,
            participants: Object.fromEntries(playerMap),
        }

        const params = {
            TableName: 'discord-bot-mh',
            Item: {
                id: matchId,
                info: info,
            }
        }

        console.log(params);

        await docClient.put(params).promise()
        .catch(error => {
            console.log('Error changing user info: ', error);
            throw new Error('Error changing user info.');
        });

        return info;
    },

    updateIndividualMatchHistory: async function (userInfo) {
        console.log('updating indiv match history!');
        unprocessedUpToDateMatchHistory = await matchListTft(userInfo.puuid);
        upToDateMatchHistory = unprocessedUpToDateMatchHistory.response;

        if (upToDateMatchHistory.length == 0) {
            console.log('User has not played any matches.');
            return {
                mhMap: null,
                mhList: null,
                refreshedMatches: 0,
                refreshedType: null,
            };
        }

        // If no match history at all
        if (userInfo.mhMap == undefined) {
            matchesMap = new Map();
            matchesList = [];
            if (upToDateMatchHistory.length < throttle) {
                throttle = upToDateMatchHistory.length;
            }

            for (let i = 0; i < throttle; i++) {
                console.log('no match history update');
                let matchDetails = await module.exports.addFullMatchDetails(upToDateMatchHistory[i]);
                if (matchDetails.tft_set_number < 4) {
                    break;
                }
                const individualMatchInfo = { // Insert carry function here for carry
                    game_datetime: matchDetails.game_datetime,
                    placement: matchDetails.participants[userInfo.puuid].placement,
                    composition: '',
                    carry: '',
                };
                matchesMap.set(upToDateMatchHistory[i], individualMatchInfo);
                // Keeps track of newest & oldest matches for match updating
                matchesList.push(upToDateMatchHistory[i]);
            }
            // // Keeps track of newest & oldest matches for match updating
            // let triggerMatches;
            // if (upToDateMatchHistory.length < throttle) {
            //     triggerMatches = {
            //         newest: upToDateMatchHistory[0],
            //         oldest: upToDateMatchHistory[upToDateMatchHistory.length - 1],
            //     }
            // } else {
            //     triggerMatches = {
            //         newest: upToDateMatchHistory[0],
            //         oldest: upToDateMatchHistory[throttle - 1],
            //     }
            // }
            return {
                mhMap: matchesMap,
                mhList: matchesList,
                refreshedMatches: throttle,
                refreshedType: 'new',
            };
        }

        mhMap = new Map(Object.entries(userInfo.mhMap));
        mhList = Object.values(userInfo.mhList);

        console.log(mhMap);
        console.log(mhList);

        // If already up to date = update older matches
        // Also handles the case of nothing to update!
        if (upToDateMatchHistory[0] == mhList[0]) {
            const oldestIndex = upToDateMatchHistory.findIndex(matchId => matchId == mhList[mhList.length - 1]);
            try {
                if (mhList.length + throttle > upToDateMatchHistory.length) {
                    throttle = upToDateMatchHistory.length - mhList.length;
                }
                for (let i = 1; i <= throttle; i++) {
                    let matchId = upToDateMatchHistory[i + oldestIndex];
                    let matchDetails = await module.exports.addFullMatchDetails(matchId);
                    if (matchDetails.tft_set_number < 4) {
                        break;
                    }
                    const individualMatchInfo = { // Insert carry function here for carry
                        game_datetime: matchDetails.game_datetime,
                        placement: matchDetails.participants[userInfo.puuid].placement,
                        composition: '',
                        carry: '',
                    };
                    mhMap.set(matchId, individualMatchInfo);
                    mhList.push(matchId);
                }
            } catch (error) {
                console.log('Error updating match history: ', error);
            } finally {
                if (throttle == 0) {
                    return {
                        mhMap,
                        mhList,
                        refreshedMatches: throttle,
                        refreshedType: null,
                    };
                }
                else {
                    return {
                        mhMap,
                        mhList,
                        refreshedMatches: throttle,
                        refreshedType: 'old',
                    };
                }
            }
        } else { // User played new matches
            const newestIndex = upToDateMatchHistory.findIndex(matchId => matchId == mhList[0]);
            for (let i = newestIndex; i > 0; i--) {
                let matchId = upToDateMatchHistory[i - 1];
                let matchDetails = await module.exports.addFullMatchDetails(matchId);
                if (matchDetails.tft_set_number < 4) {
                    break;
                }
                let lobbyParticipantsMap = new Map(Object.entries(matchDetails.participants));
                let userMatchInfo = lobbyParticipantsMap.get(userInfo.puuid);
                let userPlacement = userMatchInfo.placement;
                const individualMatchInfo = { // Insert carry function here for carry
                    game_datetime: matchDetails.game_datetime,
                    placement: userPlacement,
                    composition: '',
                    carry: '',
                };
                console.log('placement: ', userPlacement);
                mhMap.set(matchId, individualMatchInfo);
                mhList.unshift(matchId);
            }
            return {
                mhMap,
                mhList,
                refreshedMatches: newestIndex,
                refreshedType: 'new',
            };
        }
    },

    containsFullMatchDetails: async function (matchId) {
        const params = {
            TableName: 'discord-bot-mh',
            Key: {
                id: matchId,
            }
        };
        console.log(params);
        let result = await docClient.get(params).promise();
        return result.Item != undefined;
    },

    getFullMatchDetails: async function (matchId) {
        const params = {
            TableName: 'discord-bot-mh',
            Key: {
                id: matchId,
            }
        };

        let result = await docClient.get(params).promise();
        return result.Item.info;
    },
}

// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }