'use strict';
{
    let toBase64 = (input) => {
        return window.btoa(decodeURIComponent(encodeURIComponent(input)));
    };

    let headers;
    let report;
    let notify = (config) => {
        $.notify({
            // options
            icon: config.icon ? 'glyphicon ' + config.icon : '',
            title: config.title || '',
            message: config.message || '',
            url: config.url || '',
            target: '_blank'
        }, {
            // settings
            element: 'body',
            type: config.type,
            allow_dismiss: true,
            newest_on_top: true,
            showProgressbar: false,
            placement: {
                from: "top",
                align: "right"
            },
            offset: 20,
            spacing: 10,
            z_index: 1031,
            delay: 7000,
            timer: 1000,
            url_target: '_blank',
            mouse_over: true,
            animate: {
                enter: 'animated fadeInDown',
                exit: 'animated fadeOutUp'
            },
            icon_type: 'class',
            template: '<div data-notify="container" class="col-xs-11 col-sm-3 alert alert-{0}" role="alert">' +
            '<button type="button" aria-hidden="true" class="close" data-notify="dismiss">×</button>' +
            '<span data-notify="icon"></span> ' +
            '<span data-notify="title">{1}</span> ' +
            '<div>&nbsp;</div><span data-notify="message">{2}</span>' +
            '<div class="progress" data-notify="progressbar">' +
            '<div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div>' +
            '</div>' +
            '<a href="{3}" target="{4}" data-notify="url"></a>' +
            '</div>'
        });
    };

    let getEpicInfo = (url) => {
        return fetch(`${url}/rest/api/2/field`, {
            method: 'GET',
            redirect: 'follow',
            headers: headers
        })
            .then(response => {
                return response.json()
            })
            .then(fields => {
                let link = fields.find((field) => {
                    return field.name === 'Epic Link';
                });

                let name = fields.find((field) => {
                    return field.name === 'Epic Name';
                });

                let epic = {};
                epic.name = name.id;
                epic.link = link.id;

                return epic;
            })
    };

    let getJIRAs = (url, jql) => {
        let logDates = ` AND updatedDate >= ${document.getElementById('dateFrom').value} AND updatedDate <= ${document.getElementById('dateTo').value}`;

        return fetch(`${url}/rest/api/2/search?jql=${jql + logDates}&maxResults=1000`, {
            method: 'GET',
            redirect: 'follow',
            headers: headers
        })
            .then(response => {
                return response.json()
            })
    };

    let getParent = (issue) => {
        return fetch(issue.fields.parent.self, {
            method: 'GET',
            redirect: 'follow',
            headers: headers
        })
            .then(response => {
                return response.json()
            })

    };

    let getEpicName = (issue, epic, url) => {
        let epicLink = issue.fields[epic.link];

        if (!epicLink) {
            return Promise.resolve('NO-EPIC');
        }

        return fetch(`${url}/rest/api/2/issue/${issue.fields[epic.link]}`, {
            method: 'GET',
            redirect: 'follow',
            headers: headers
        })
            .then(response => {
                return response.json()
            })
            .then(thisEpic => {
                return thisEpic;
            })
    };

    let quoteCount = 0;

    let doTheChuck = () => {
        return fetch('https://api.chucknorris.io/jokes/random', {
            method: 'GET',
            redirect: 'follow'
        })
            .then(response => {
                return response.json()
            });
    };

    let getQuote = async () => {
        let quote = await doTheChuck();
        let titles = [
            '<div>This is taking some time...</div><div>Enjoy this Chuck Norris quote while you wait:</div>',
            '<div>It\'s not called the World Wide Wait for nothing!</div><div>Here\'s another quote:</div>',
            '<div>Knock-Knock! Who\'s there?</div><div>It\'s another Chuck Norris quote:</div>',
            '<div>Should we sing a song while we wait?</div><div>Nah, let\'s do another Chuck Norris quote:</div>',
            '<div>No, y\'ruoe not mroe itneillengt bceuase you can raed tihs</div><div>Here\'s another quote to make you feel better:</div>',
            '<div>I actually get payed to do stuff like this!</div><div>Let\'s celebrate that with another Chuck Norris quote:</div>',
            '<div>Guess what?!</div><div>It\s Chuck Norris quote time (again):</div>',
            '<div>What are you still doing here..?</div><div>Here\'s another Chuck Norris quote, now leave me alone:</div>'
        ];

        if (quoteCount === 0) {
            notify({
                type: 'info',
                title: '<div>This is taking some time...</div><div>Enjoy this Chuck Norris quote while you wait:</div>',
                message: quote.value
            });
        } else {
            notify({
                type: 'info',
                title: '<div>It\'s not called the World Wide Wait for nothing!</div><div>Here\'s another quote:</div>',
                message: `<div>${quote.value}</div>`,
                url: quote.url
            });
        }

        return setTimeout(getQuote, 5000);
    };

    let getIndex = async (storage) => {
        headers = new Headers({
            'Authorization': 'Basic ' + toBase64(storage.login + ':' + storage.password),
            'Content-Type': 'application/json'
        });

        let whileYouWait = setTimeout(getQuote, 5000);

        const epic = await getEpicInfo(storage.url);
        const jiras = await getJIRAs(storage.url, storage.jql);

        let mapUser = new Map();
        let mapEpic = new Map();

        storage.fromDate = new Date(storage.fromDate);
        storage.toDate = new Date(storage.toDate);
        storage.report = {};
        storage.report.assignee = [];
        storage.report.total = 0;
        storage.report.issues = {};

        for (let issue of jiras.issues) {
            let assignee = issue.fields.assignee;
            let key = '';
            let data = {};
            let user = {};
            let thisEpic = {};
            let thatEpic = {};

            if (assignee) {
                key = assignee.key;
            } else {
                console.info('You should opitimize the JQL to exclude unassigned JIRAs');
                continue;
            }

            storage.report.total++;

            if (!mapUser.has(key)) {
                mapUser.set(key, {
                    aggregatetimeoriginalestimate: 0,
                    aggregatetimespent: 0,
                    index: 0,
                    total: 0,
                    displayName: issue.fields.assignee.displayName,
                    data: []
                });
            }

            user = mapUser.get(key);

            user.aggregatetimeoriginalestimate += issue.fields.aggregatetimeoriginalestimate;
            user.aggregatetimespent += issue.fields.aggregatetimespent;
            user.total++;

            data.aggregatetimeoriginalestimate = issue.fields.aggregatetimeoriginalestimate;
            data.aggregatetimespent = issue.fields.aggregatetimespent;

            if (issue.fields.issuetype.subtask) {
                issue = await getParent(issue);
            }

            thisEpic = await getEpicName(issue, epic, storage.url);

            data.epicName = thisEpic.fields ? thisEpic.fields[epic.name] : thisEpic;

            data.isSubtask = issue.fields.issuetype.subtask;

            user.data.push(data);

            if (!mapEpic.has(data.epicName)) {
                mapEpic.set(data.epicName, {
                    aggregatetimeoriginalestimate: 0,
                    aggregatetimespent: 0,
                    index: 0,
                    total: 0,
                    displayName: data.epicName,
                    data: []
                });
            }

            thatEpic = mapEpic.get(data.epicName);

            thatEpic.aggregatetimeoriginalestimate += issue.fields.aggregatetimeoriginalestimate;
            thatEpic.aggregatetimespent += issue.fields.aggregatetimespent;

            thatEpic.total++;
            thatEpic.data.push(user);


            report = storage.report;
        }

        clearInterval(whileYouWait);

        storage.report.assignee = mapUser;

        for (let key of mapUser.keys()) {
            let user = mapUser.get(key);

            user.index = user.aggregatetimeoriginalestimate / user.aggregatetimespent
        }

        for (let key of mapEpic.keys()) {
            let epic = mapEpic.get(key);

            epic.index = epic.aggregatetimeoriginalestimate / epic.aggregatetimespent
        }

        storage.report.epics = mapEpic;

        if (createEpics(storage)) {
            createReport(storage.report);
        }
    };

    let getWebSafeName = (data) => {
        return 'X--' + data.replace(/[ +,.'&/()%]/g, '');
    };

    let createEpics = (data) => {
        const epics = data.report.epics;
        let epicId = '';
        let epicButtons = '';
        let isChecked = false;
        let hasDisabledEpics = false;

        for (let [key, info] of epics) {
            epicId = getWebSafeName(info.displayName);
            isChecked = data[epicId];

            if (typeof(isChecked) !== 'boolean') {
                isChecked = true;
            }

            if (!isChecked) {
                hasDisabledEpics = true;
            }

            epicButtons += `<label class="btn btn-primary${isChecked ? ' active' : ''}">
                        <input type="checkbox" autocomplete="off" ${isChecked ? 'checked' : ''} data-name="${info.displayName}" id="${epicId}"> ${info.displayName}
                      </label>`;
        }

        document.getElementById('epics-list').innerHTML = epicButtons;

        if (hasDisabledEpics) {
            setTimeout(() => {
                createReportForLimitedEpics();

            }, 300);
            return false;
        } else {
            return true;
        }
    };

    let reportUser = (data) => {
        let html = '<table class="table table-striped table-bordered table-hover"><tr><th>User</th><th>Index</th><th>Epics</th></tr>';
        let memberOfEpics;
        let users = Array.from(data.assignee);

        users = users.filter((user) => {
            if (!isNaN(user[1].index)) { //Hide users that have no data.
                return user;
            }
        });

        users.sort((a, b) => {
            return parseFloat(b[1].index) - parseFloat(a[1].index); //Sort in descending order.
        });

        for (const [index, thisData] of users.entries()) {
            let key = thisData[0];
            let info = thisData[1];

            memberOfEpics = info.data.map((issue) => {
                return `<span class="${getWebSafeName(issue.epicName)} ${data.activeEpics.includes(issue.epicName) ? '' : 'inactive'}">${issue.epicName}</span>`;
            });

            memberOfEpics = [...new Set(memberOfEpics)].join(', ');

            html += `<tr><td>${info.displayName}</td><td>${info.index}</td><td>${memberOfEpics}</td></tr>`
        }


        return html += '</tr></table>';
    };

    let reportEpic = (data) => {
        let html = '<table class="table table-striped table-bordered table-hover"><tr><th>Epic</th><th>Index</th><th>Count</th></tr>';
        let epics = Array.from(data.epics);

        epics.sort((a, b) => {
            return parseFloat(b[1].index) - parseFloat(a[1].index); //Sort in descending order.
        });

        for (const [index, thisData] of epics.entries()) {
            let key = thisData[0];
            let info = thisData[1];

            html += `<tr><td>${info.displayName}</td><td>${info.index}</td><td>${info.total}</td></tr>`
        }


        return html += '</tr></table>';
    };


    let createReport = (data) => {
        let loading = document.getElementById('loading');
        let holderUser = document.getElementById('user-stats');
        let holderEpic = document.getElementById('epic-stats');

        holderUser.innerHTML = reportUser(data);
        holderEpic.innerHTML = reportEpic(data);

        loading.classList.add('hide');
        holderUser.classList.remove('hide');
        holderEpic.classList.remove('hide');
    };

    let getStorage = () => {
        let loading = document.getElementById('loading');

        loading.classList.remove('hide');

        chrome.storage.local.get(function (storage) {
            getIndex(storage)
        })
    };

    let setEpicsForUsers = (e) => {
        let checkbox = e.target.querySelector('input[type="checkbox"]');

        if (!checkbox) {
            return;
        }

        let isChecked = checkbox.checked;
        let id = checkbox.id;
        let boxes = [];
        let action = '';

        if (isChecked) {
            boxes = document.querySelectorAll(`.${id}.inactive`);
            action = 'remove';
        } else {
            boxes = document.querySelectorAll(`.${id}`);
            action = 'add';
        }

        for (let box of boxes) {
            box.classList[action]('inactive');
        }
    };

    let createReportForLimitedEpics = () => {
        let epics = [];
        let epicsChecked = document.querySelectorAll('input[type="checkbox"]:checked');
        let thisReport = Object.assign({}, report); //Copy the object

        for (let epic of epicsChecked) {
            if (epic.checked) {
                epics.push(epic.dataset.name);
            }
        }

        for (let [key, info] of report.assignee) {
            let aggregatetimeoriginalestimate = 0;
            let aggregatetimespent = 0;

            for (let data of info.data) {
                if (epics.includes(data.epicName)) {
                    aggregatetimeoriginalestimate += data.aggregatetimeoriginalestimate;
                    aggregatetimespent += data.aggregatetimespent;
                }
            }

            thisReport.assignee.get(key).index = aggregatetimeoriginalestimate / aggregatetimespent;
        }

        thisReport.activeEpics = epics;

        createReport(thisReport);
    };

    let init = () => {
        Flatpickr.l10ns.default.firstDayOfWeek = 1;

        flatpickr('.flatpickr', {
            wrap: true,
            weekNumbers: true, // show week numbers
            maxDate: new Date()
        });

        document.getElementById('epics-list').addEventListener('click', (event) => {
            (function (e) {
                setEpicsForUsers(e);

                setTimeout(() => {
                    createReportForLimitedEpics();

                    let field = event.target.control;
                    let data = {};

                    data[field.id] = field.checked;
                    chrome.storage.local.set(data);

                }, 300);

            }(event))
        });

        document.getElementById('doIt').addEventListener('click', getStorage);

    };

    init();

}