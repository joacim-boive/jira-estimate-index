'use strict';
{
    let toBase64 = (input) => {
        return window.btoa(decodeURIComponent(encodeURIComponent(input)));
    };

    let headers;
    let report;

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
                return thisEpic.fields[epic.name];
            })
    };

    let getIndex = async (storage) => {
        headers = new Headers({
            'Authorization': 'Basic ' + toBase64(storage.login + ':' + storage.password),
            'Content-Type': 'application/json'
        });

        const epic = await getEpicInfo(storage.url);
        const jiras = await getJIRAs(storage.url, storage.jql);

        let map = new Map();

        storage.fromDate = new Date(storage.fromDate);
        storage.toDate = new Date(storage.toDate);
        storage.report = {};
        storage.report.assignee = [];
        storage.report.total = 0;
        storage.report.epics = [];
        storage.report.issues = {};

        for (let issue of jiras.issues) {
            let assignee = issue.fields.assignee;
            let key = '';
            let data = {};
            let user = {};

            if (assignee) {
                key = assignee.key;
            } else {
                console.info('You should opitimize the JQL to exclude unassigned JIRAs');
                continue;
            }

            storage.report.total++;

            if (!map.has(key)) {
                map.set(key, {
                    aggregatetimeoriginalestimate: 0,
                    aggregatetimespent: 0,
                    index: 0,
                    total: 0,
                    displayName: issue.fields.assignee.displayName,
                    data: []
                });
            }

            user = map.get(key);

            user.aggregatetimeoriginalestimate += issue.fields.aggregatetimeoriginalestimate;
            user.aggregatetimespent += issue.fields.aggregatetimespent;
            user.total++;

            data.aggregatetimeoriginalestimate = issue.fields.aggregatetimeoriginalestimate;
            data.aggregatetimespent = issue.fields.aggregatetimespent;

            if (issue.fields.issuetype.subtask) {
                issue = await getParent(issue);
            }

            data.epicName = await getEpicName(issue, epic, storage.url);
            data.isSubtask = issue.fields.issuetype.subtask;

            storage.report.epics.push(data.epicName);

            user.data.push(data);

            report = storage.report;
        }

        storage.report.assignee = map;

        for (let key of map.keys()) {
            let user = map.get(key);

            user.index = user.aggregatetimeoriginalestimate / user.aggregatetimespent
        }

        storage.report.epics = [...new Set(storage.report.epics)];

        storage.report.activeEpics = storage.report.epics;

        if(createEpics(storage)){
            createReport(storage.report);
        }
    };

    let getWebSafeName = (data) => {
        return 'X--' + data.replace(/[ +,.'&/()%]/g, '');
    };

    let createEpics = (data) => {
        const epics = data.report.epics;
        let epicButtons = '';
        let isChecked = false;
        let hasDisabledEpics = false;

        for (let epic of epics) {
            isChecked = data[getWebSafeName(epic)];

            if (typeof(isChecked) !== 'boolean') {
                isChecked = true;
            }

            if (!isChecked) {
                hasDisabledEpics = true;
            }

            epicButtons += `<label class="btn btn-primary${isChecked ? ' active' : ''}">
                        <input type="checkbox" autocomplete="off" ${isChecked ? 'checked': ''} data-name="${epic}" id="${getWebSafeName(epic)}"> ${epic}
                      </label>`;
        }

        document.getElementById('epics-list').innerHTML = epicButtons;

        if (hasDisabledEpics) {
            setTimeout(() => {
                createReportForLimitedEpics();

            }, 300);
            return false;
        }else{
            return true;
        }
    };

    let createReport = (data) => {
        let holder = document.getElementById('user-stats');
        let loading = document.getElementById('loading');
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


        html += '</tr></table>';
        holder.innerHTML = html;

        loading.classList.add('hide');
        holder.classList.remove('hide');
    };

    let getStorage = () => {
        let loading = document.getElementById('loading');

        loading.classList.remove('hide');

        chrome.storage.local.get(function (storage) {
            // getIndex(storage).then(data => createReport(data));
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