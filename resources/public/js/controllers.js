var hsboxControllers = angular.module('hsboxControllers', []);

function getPlayerSummaries(steamids) {
    return serverUrl + '/steamids/info?steamids=' + steamids.join(',');
}

function demoOutcome(demoStats) {
    if (demoStats.winner == '2')
        outcome = 'Team A wins';
    else if (demoStats.winner == '3')
        outcome = 'Team B wins';
    else
        outcome = 'Draw';
    return outcome + '! ';
}

function timestamp2date(timestamp, only_date) {
    if (!timestamp)
        return '';
    only_date = typeof only_date !== 'undefined' ? only_date : false;
    d = new Date(timestamp * 1000);
    format = {day: 'numeric', month: 'short'};
    if (!only_date) {
        var time_format = {hour: "2-digit", minute: "2-digit", hour12: false};
        for (var attrname in time_format) {
            format[attrname] = time_format[attrname];
        }
    }
    if (d.getFullYear() != (new Date()).getFullYear())
        format.year = 'numeric';
    return d.toLocaleString(undefined, format);
};

function date2timestamp(date) {
    if (date)
        return Math.round(date / 1000);
    return null;
}

function watchDemoUrl(path, steamid, tick, highlight) {
    return 'steam://rungame/730/' + steamid + '/+playdemo "' +
        encodeURI(path) + (tick ? '@' + tick : '') + '" ' +
        (highlight ? steamid : '') +
        (highlight == 'lowlights' ? ' lowlights' : '');
}

function getBanTimestamp(player) {
    return date2timestamp(Date.now()) - 3600 * 24 * player['DaysSinceLastBan'];
}

function bannedSinceDemo(banTimestamp, demoTimestamp) {
    return ((banTimestamp - demoTimestamp) / (24 * 3600) | 0);
}

function banInfo(player) {
    var info = "";
    if (player == null)
        return "";
    if (player['NumberOfVACBans'] > 0)
        info = player['NumberOfVACBans'] + " VAC bans";
    if (player['NumberOfGameBans'] > 0) {
        if (info != "")
            info += ", ";
        info += player['NumberOfGameBans'] + " game bans";
    }
    return info;
}

function bansTooltip(player, demoTimestamp) {
    var tooltip = banInfo(player);
    if (tooltip != "") {
        tooltip += ", " + player['DaysSinceLastBan'] + " days since last ban";
        var banTimestamp = getBanTimestamp(player);
        if (banTimestamp >= demoTimestamp)
             return tooltip + " (" + bannedSinceDemo(banTimestamp, demoTimestamp) + " days since this game)";
    }
    return "";
}

function getRequestFilters($scope) {
    var params = JSON.parse(JSON.stringify($scope.filterDemos));
    var teammates = [];
    $scope.filterTeammates.forEach(function (t) {
        teammates.push(t.steamid);
    });
    if (teammates.length > 0)
        params['teammates'] = teammates.join();
    return params;
}

function filtersChanged($scope, $http) {
    var params = getRequestFilters($scope);
    $http.get(serverUrl + '/player/' + steamid + '/stats', {'params': params}).success(function(data) {
        $scope.stats = data;
        $scope.stats.weapons.forEach(function (p) {
            p.hs_percent = (p.hs / p.kills) * 100;
        });
    });
    $scope.tabs.demos.isLoaded = $scope.tabs.charts.isLoaded = false;
    if (!$scope.tabs[$scope.activeTab].isLoaded)
        $scope.loadTab($scope.tabs[$scope.activeTab]);
}

hsboxControllers.controller('Player', function ($scope, $http, $routeParams, $sce, $rootScope) {
    $scope.valveOnly = false;
    $scope.playerMaps = [];
    $scope.playerTeammates = [];
    $scope.banned = []
    $scope.filteredBanned = [];
    $scope.opponentsOnly = true;
    $scope.filterBanned = function() {
        $scope.opponentsOnly = !$scope.opponentsOnly;
        $scope.filteredBanned = $scope.banned.filter(function (p) {
            if ($scope.opponentsOnly)
                return p.opponent;
            return true;
        });
    };
    $scope.filterDemos = {'startDate': null, 'endDate': null};
    $scope.filterTeammates = [];
    $scope.watchDemoUrl = watchDemoUrl;
    $scope.bannedSinceDemo = bannedSinceDemo;
    $scope.getBanTimestamp = getBanTimestamp;
    $scope.bansTooltip = bansTooltip;
    $scope.banInfo = banInfo;
    steamid = $routeParams.steamid;
    $scope.orderWeapons = '-kills';
    $scope.steamid = steamid;
    $scope.orderDemos = '-timestamp';
    $scope.orderBanned = 'DaysSinceLastBan';
    $scope.demoStats = {}
    $scope.steamAccounts = {}
    $scope.visibleDemo = ''
    $scope.visibleRound = 0
    $scope.orderTeams = '-kills';
    $scope.chartSelected = 'mapsplayed';
    $scope.getPlayersInfo = function(missingPlayers) {
        if (missingPlayers.length == 0)
            return;
        $http.get(getPlayerSummaries(missingPlayers)).success(function (response) {
            for (var player in response) {
                $scope.steamAccounts[player] = response[player];
            }
        });
    };

    $scope.resetNotesControls = function() {
        $scope.notesControls = {'demoNotesInput': '', 'demoNotesView': ''};
    };
    $scope.linkToTick = function(demo, p1) {
        tick = parseInt(p1, 10);
        round = false;
        if (demo.lastIndexOf('round', 0) === 0) {
            tick = $scope.theDemo.rounds[tick - 1].tick;
            round = true;
        }
        return "<a href='" + watchDemoUrl($scope.theDemo.path, steamid, tick) + "'>" + demo + "</a>";
    }
    $scope.addLinks = function(text) {
        if (text == null)
            return "";
        text = text.replace(/(?:\r\n|\r|\n)/g, '<br />');
        return text.replace(/(?:(?:round|tick) ?)(\d+)/g, $scope.linkToTick);
    };
    $scope.updateDemoNotesView = function() {
        if (typeof $scope.notesControls.demoNotesInput != undefined)
            $scope.notesControls.demoNotesView = $sce.trustAsHtml($scope.addLinks($scope.notesControls.demoNotesInput));
    };
    $scope.updateDemoNotes2 = function() {
        if ($rootScope.isAuthorized)
            $http.post(serverUrl + '/demo/' + $scope.visibleDemo + '/notes', {'notes': $scope.notesControls.demoNotesInput}).success(function() {
                $scope.updateDemoNotesView();
            });
    }

    $scope.resetNotesControls();
    $scope.doMakeVisible = function(demoid, round) {
        $scope.resetNotesControls();
        $scope.visibleDemo = demoid;
        $scope.theDemo = $scope.demoStats[demoid];
        $scope.visibleRound = round;
        $http.get(serverUrl + '/demo/' + demoid + '/notes').success(function (response) {
            if ($scope.visibleDemo == demoid) {
                $scope.demoStats[$scope.visibleDemo].notes = response.notes;
                $scope.notesControls['demoNotesInput'] = response.notes;
                $scope.updateDemoNotesView();
            }
        });
    };
    $scope.makeVisible = function(demoid, round) {
        round = typeof round !== 'undefined' ? round : 0;
        if ($scope.visibleDemo != demoid) {
            if (!$scope.demoStats[demoid]) {
                $http.get(serverUrl + '/demo/' + demoid + '/stats').success(function(data) {
                    $scope.demoStats[demoid] = data;
                    $scope.doMakeVisible(demoid, round);

                    // Compute kdd and fetch steamids data from steam
                    missingPlayers = [];
                    for (var key in $scope.theDemo.teams) {
                        if ($scope.theDemo.teams.hasOwnProperty(key)) {
                            $scope.theDemo.teams[key].forEach(function (p) {
                                p.kdd = p.kills - p.deaths;
                                if (!$scope.steamAccounts[p.steamid])
                                    missingPlayers[missingPlayers.length] = p.steamid;
                            });
                        }
                    }
                    $scope.getPlayersInfo(missingPlayers);
                });
            } else
                $scope.doMakeVisible(demoid, round);

        }
        else if ($scope.visibleRound == round) {
            $scope.visibleRound = 0;
            $scope.visibleDemo = '';
            $scope.theDemo = '';
        } else {
            $scope.doMakeVisible(demoid, round);
        }
    };
    $scope.isVisible = function(demoid, round) {
        round = typeof round !== 'undefined' ? round : 0;
        return $scope.visibleDemo == demoid && $scope.visibleRound == round;
    };

    $scope.demoOutcome = demoOutcome;

    $scope.setDemoType = function(demoType) {
        $scope.filterDemos.demoType = demoType;
        filtersChanged($scope, $http);
    };

    $scope.setMap = function(map) {
        $scope.filterDemos.mapName = map;
        filtersChanged($scope, $http);
    };

    $scope.datepickerStatus = [false, false];
    $scope.openDatepicker = function($event, $no) {
        $event.preventDefault();
        $event.stopPropagation();
        $scope.datepickerStatus[$no] = true;
    };

    $scope.addTeammate = function(teammate) {
        if ($scope.filterTeammates.indexOf(teammate) != -1 || $scope.filterTeammates.length == 4)
            return;
        $scope.filterTeammates.push(teammate);
        filtersChanged($scope, $http);
    };

    $scope.removeTeammate = function(teammate) {
        var $i = $scope.filterTeammates.indexOf(teammate);
        if ($i == -1)
            return;
        $scope.filterTeammates.splice($i, 1);
        filtersChanged($scope, $http);
    };

    $scope.$watch('startDate', function() {
        var $changed = $scope.filterDemos.startDate != date2timestamp($scope.startDate);
        $scope.filterDemos.startDate = date2timestamp($scope.startDate);
        if ($changed)
            filtersChanged($scope, $http);
    });
    $scope.$watch('endDate', function() {
        var $changed = $scope.filterDemos.endDate != date2timestamp($scope.endDate);
        $scope.filterDemos.endDate = date2timestamp($scope.endDate);
        if ($changed)
            filtersChanged($scope, $http);
    });

    $scope.setTabLoaded = function($content) {
        $scope.tabs[$content].isLoaded = true;
    }

    // Tabs
    var loadBanned = function() {
        $http.get(serverUrl + '/player/' + steamid + '/banned').success(function (data) {
            $scope.banned = data;
            $scope.banned.forEach(function (b) {
                b.last_played = timestamp2date(b.timestamp);
                b.ban_timestamp = getBanTimestamp(b);
                b.days_banned_after_last_played = bannedSinceDemo(b.ban_timestamp, b.timestamp);
            });
            $scope.filterBanned($scope.opponentsOnly);
            $scope.setTabLoaded('banned');
        });
    };
    var loadMaps = function() {
        var params = getRequestFilters($scope);
        $http.get(serverUrl + '/player/' + steamid + '/maps/statistics', {'params': params}).success(function (data) {
            $scope.mapsPlayedConfig.series[0].data = [];
            $scope.mapsWinConfig.series[0].data = [];
            $scope.mapsWinConfig.series[1].data = [];
            $scope.mapsWinConfig.series[2].data = [];
            $scope.mapsWinConfig.xAxis.categories = [];
            $scope.roundsWinConfig.series[0].data = [];
            $scope.roundsWinConfig.series[1].data = [];
            for (var key in data) {
                $scope.mapsWinConfig.xAxis.categories.push(key);
                $scope.roundsWinConfig.xAxis.categories.push(key);
                $scope.mapsPlayedConfig.series[0].data.push({name: key, y: data[key].played});
                var t_won = data[key].won - data[key].won_starting_ct;
                var t_lost = data[key].lost - data[key].lost_starting_ct;
                var games = data[key].won + data[key].lost;
                var started_t = t_won + t_lost;
                var started_ct = data[key].won_starting_ct + data[key].lost_starting_ct;
                $scope.mapsWinConfig.series[0].data.push({name: key, y: (t_won + t_lost) ? t_won / started_t * 100 | 0: null,
                                                          played: started_t,
                                                          won: t_won});
                $scope.mapsWinConfig.series[1].data.push({name: key, y: data[key].won_starting_ct / started_ct * 100 | 0,
                                                          played: started_ct, won: data[key].won_starting_ct});
                $scope.mapsWinConfig.series[2].data.push({name: key, y: data[key].won / games * 100 | 0,
                                                          played: games,
                                                          won: data[key].won});
                $scope.roundsWinConfig.series[0].data.push({name: key, y: data[key].t_rounds ? data[key].t_rounds_won / data[key].t_rounds * 100 | 0: null,
                                                            played: data[key].t_rounds,
                                                            won: data[key].t_rounds_won});
                $scope.roundsWinConfig.series[1].data.push({name: key, y: data[key].ct_rounds ? data[key].ct_rounds_won / data[key].ct_rounds * 100 | 0: null,
                                                            played: data[key].ct_rounds,
                                                            won: data[key].ct_rounds_won});
            }
            setTimeout(function(){
                window.dispatchEvent(new Event('resize'));
            }, 0);
            $scope.setTabLoaded('charts');
        });
    };
    var getDemos = function() {
        var params = getRequestFilters($scope);
        $http.get(serverUrl + '/player/' + steamid + '/demos', {'params': params}).success(function(data) {
            $scope.demos = data;
            var $valveOnly = true;
            $scope.demos.forEach(function (m) {
                m.kdd = m.kills - m.deaths;
                if (!m.timestamp)
                    m.timestamp = 0;
                if (m.type != 'valve')
                    $valveOnly = false;
                m.date = timestamp2date(m.timestamp);
            });
            if ($scope.rankConfig.series[0].data == null) {
                var d = [];
                $scope.demos.forEach(function (m) {
                    if (m.mm_rank_update != null && m.mm_rank_update.rank_new != 0) {
                        d.push({x: m.timestamp, y: m.mm_rank_update.rank_new, date: m.date, old: m.mm_rank_update.rank_old, wins: m.mm_rank_update.num_wins});
                    }
                });
                $scope.rankConfig.series[0].data = d;
            }
            $scope.valveOnly = $valveOnly;
            $scope.setTabLoaded('demos');
        });
    };

    $scope.activeTab = 'demos';
    $scope.tabs = {
        'demos': { heading: 'Demos', content: 'demos', icon: 'history', isLoaded: true, load: getDemos },
        'weapon_stats': { heading: 'Weapon Stats', content: 'weapon_stats', icon: 'bullseye', isLoaded: true },
        'banned': { heading: 'Banned Players', content: 'banned', icon: 'ban', isLoaded: false, load: loadBanned },
        'search_round': { heading: 'Search Round', content: 'search_round', icon: 'search', isLoaded: true },
        'charts': { heading: 'Charts', content: 'charts', icon: 'bar-chart', isLoaded: false, load: loadMaps }
    };
    $scope.tabArray = [];
    for (var tab in $scope.tabs) {
        $scope.tabArray.push($scope.tabs[tab]);
    };
    $scope.loadTab = function ($tab) {
        $scope.activeTab = $tab.content;
        if ($tab.isLoaded || $tab.load == undefined)
            return;
        $tab.load();
    };

    // Charts
    $scope.mapsPlayedConfig = {
        options: {
            chart: {
                type: 'pie',
                animation: false
            },
            title: {
                text: null
            },
            plotOptions: {
                pie: {
                    dataLabels: {
                        enabled: true,
                        format: '{point.name}: {point.y}',
                        connectorColor: 'green'
                    }
                },
                series: {animation: false}
            }
        },
        series: [{name: 'Matches'}]
    };


    var pointFormat = '<span style="color:{point.color}">\u25CF</span> {series.name}: <b>{point.y}%</b> ({point.won}/{point.played})<br/>';
    $scope.mapsWinConfig = {
        options: {
            chart: {
                type: 'column',
                animation: false
            },
            title: {
                text: null
            },
            plotOptions: {
                column: {
                    dataLabels: {
                        enabled: true,
                        format: '{point.y:,.0f}'
                    }
                },
                series: {
                    pointWidth: 10,
                    animation: false
                }
            },
            xAxis: {
                gridLineWidth: 0,
                minorGridLineWidth: 0,
                tickAmount: 0,
                lineColor: 'transparent'
            },
            yAxis: {
                gridLineWidth: 0,
                minorGridLineWidth: 0,
                tickAmount: 0,
                lineColor: 'transparent',
                showLastLabel: false,
                showFirstLabel: false,
                title: {text: 'Win%'}
            },
            colors: ['red', 'blue', 'green'],
            tooltip: { pointFormat: pointFormat }
        },
        xAxis: {categories: []},
        series: [{name: 'Starting T'},
                 {name: 'Starting CT'},
                 {name: 'Overall'}]
    };

    $scope.roundsWinConfig = {
        options: {
            chart: {
                type: 'column',
                animation: false
            },
            title: {
                text: null
            },
            plotOptions: {
                column: {
                    dataLabels: {
                        enabled: true,
                        format: '{point.y:,.0f}'
                    }
                },
                series: {
                    pointWidth: 10,
                    animation: false
                }
            },
            xAxis: {
                gridLineWidth: 0,
                minorGridLineWidth: 0,
                tickAmount: 0,
                lineColor: 'transparent'
            },
            yAxis: {
                gridLineWidth: 0,
                minorGridLineWidth: 0,
                tickAmount: 0,
                lineColor: 'transparent',
                showLastLabel: false,
                showFirstLabel: false,
                title: {text: 'Win%'}
            },
            colors: ['red', 'blue'],
            tooltip: { pointFormat: pointFormat }
        },
        xAxis: {categories: []},
        series: [{name: 'T Rounds'},
                 {name: 'CT Rounds'}]
    };

    var rankNames = ['Silver I',
                     'Silver II',
                     'Silver III',
                     'Silver IV',
                     'Silver Elite',
                     'Silver Elite Master',
                     'Gold Nova I',
                     'Gold Nova II',
                     'Gold Nova III',
                     'Gold Nova Master',
                     'Master Guardian I',
                     'Master Guardian II',
                     'Master Guardian Elite',
                     'Distinguished Master Guardian',
                     'Legendary Eagle',
                     'Legendary Eagle Master',
                     'Supreme Master First Class',
                     'Global Elite'];
    var rankImg = function(rank) { return '<img src="img/ranks/' + rank + '.png" title="' + rankNames[rank - 1] + '"></img>'; };
    var rankTooltipFormatter = function() {
        return this.date + ' '
             + (this.old != this.y ? (this.old == 0 ? '' : rankImg(this.old)) + '<i class="fa fa-long-arrow-right"></i>': '')
             + rankImg(this.y) + '<br/>' + this.wins + ' competitive wins';
    };
    $scope.rankConfig = {
        options: {
            chart: {
                type: 'line',
                animation: false
            },
            title: {
                text: null
            },
            plotOptions: {
                column: {
                    dataLabels: {
                        enabled: true,
                        format: '{point.y}'
                    }
                },
                series: {
                    pointWidth: 10,
                    animation: false
                }
            },
            xAxis: {
                labels: {formatter: function() { return timestamp2date(this.value, true); }}
            },
            yAxis: {
                title: {text: null},
                labels: {
                    useHTML: true,
                    formatter: function() { return rankImg(this.value); }
                }
            },
            tooltip: { pointFormatter: rankTooltipFormatter,
                       headerFormat: '',
                       useHTML: true}
        },
        series: [{name: 'Rank', data: null}]
    };

    filtersChanged($scope, $http);
    $http.get(getPlayerSummaries([steamid])).success(function (response) {
        $scope.player = response[steamid];
    });
    $http.get(serverUrl + '/player/' + steamid + '/maps').success(function(data) {
        $scope.playerMaps = data;
    });
    $http.get(serverUrl + '/player/' + steamid + '/teammates').success(function(data) {
        $scope.playerTeammates = data;
        missingPlayers = []
        $scope.playerTeammates.forEach(function (p) {
            if (!$scope.steamAccounts[p.steamid])
                missingPlayers[missingPlayers.length] = p.steamid;
        });
        $scope.getPlayersInfo(missingPlayers);
        if (!$scope.$$phase)
            $scope.$apply();
    });
});

hsboxControllers.controller('PlayerList', function ($scope, $http) {
    $http.get(serverUrl + '/players').success(function (data) {
        $scope.players = data;
        var steamIds = $scope.players.map(function(p) { return p.steamid; });
        var url = getPlayerSummaries(steamIds);
        $http.get(url).success(function (response) {
            for (var i in $scope.players) {
                player = $scope.players[i];
                if (response[player.steamid]) {
                    player.avatar = response[player.steamid].avatar;
                    player.personaname = response[player.steamid].personaname;
                }
            }
        });
    });
});

hsboxControllers.controller('RoundSearch', function ($scope, $http, $routeParams) {
    $scope.setOrder = function(field) {
        if ($scope.orderRounds == field)
            $scope.orderRounds = '-' + field;
        else
            $scope.orderRounds = field;
    }
    $scope.orderRounds = '-timestamp';
    $scope.watchDemoUrl = watchDemoUrl;
    $scope.roundHelpIsCollapsed = true;
    steamid = $routeParams.steamid;
    $scope.search_string = "";
    $scope.search = function() {
        $http.get(serverUrl + '/round/search', { params: {'search-string': steamid + ' ' + $scope.search_string} }).success(function(data) {
            $scope.rounds = data;
            $scope.rounds.forEach(function (r) {
                if (!r.timestamp)
                    r.timestamp = 0;
                r.date = timestamp2date(r.timestamp);
                if (r.won)
                    r.won_str = "Yes";
                else
                    r.won_str = "No";
            });
        });
    }
});

hsboxControllers.controller('Settings', function ($scope, $http, $rootScope) {
    $scope.steamApiCollapsed = true;
    $scope.demoDirectoryCollapsed = true;
    $scope.getSettings = function() {
        $http.get(serverUrl + '/config').success(function(data) {
            $scope.config = data;
        });
    };
    $scope.config = {};
    $scope.updateSettings = function() {
        $http.post(serverUrl + '/config', $scope.config).success(function(data) {
        });
    };

    $scope.invertIndexerState = function() {
        if (typeof $scope.indexerRunning === 'undefined')
            return;
        $http.post(serverUrl + '/indexer', {'running': !$scope.indexerRunning}).success(function(data) {
            $scope.getIndexerState();
        });
    };

    $scope.getIndexerState = function() {
        $http.get(serverUrl + '/indexer').success(function(data) {
            $scope.indexerRunning = data.running;
        });
    };

    $rootScope.$watch('isAuthorized', function() {
        if ($rootScope.isAuthorized) {
            $scope.getSettings();
            $scope.getIndexerState();
        }
    });
});

hsboxControllers.controller('Navbar', function ($scope, $http, $interval, $rootScope) {
    $rootScope.isAuthorized = false;
    $scope.active = 'player_list';
    $scope.version = '';
    $scope.newVersionAvailable = false;
    $scope.checkVersion = function($scope) {
        $http.get(serverUrl + '/version').success(function(data) {
            $scope.version = data.current;
            if (data.current != data.latest)
                $scope.newVersionAvailable = true;
        });
    };
    $scope.checkVersion($scope);
    $interval(function(){ $scope.checkVersion($scope); }, 1000 * 3600 * 24);
    // TODO user route params to set active?

    $rootScope.getAuthorizationState = function() {
        $http.get(serverUrl + '/authorized').success(function(data) {
            $rootScope.isAuthorized = data.authorized;
        });
    };

    $rootScope.getAuthorizationState();
});
