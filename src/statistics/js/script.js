'use strict';
{
    let toBase64 = (input) => {
        return window.btoa(decodeURIComponent(encodeURIComponent(input)));
    };

    let headers;

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
        let epics = '';

        headers = new Headers({
            'Authorization': 'Basic ' + toBase64(storage.login + ':' + storage.password),
            'Content-Type': 'application/json'
        });

        const epic = await getEpicInfo(storage.url);
        const jiras = await getJIRAs(storage.url, storage.jql);

        storage.fromDate = new Date(storage.fromDate);
        storage.toDate = new Date(storage.toDate);
        storage.report = {};
        storage.report.assignee = {};
        storage.report.total = 0;
        storage.report.epics = [];
        storage.report.issues = {};

        for (let issue of jiras.issues) {
            let assignee = issue.fields.assignee;
            let key = '';
            let data = {};

            if (assignee) {
                key = assignee.key;
            } else {
                console.info('You should opitimize the JQL to exclude unassigned JIRAs');
                continue;
            }

            storage.report.total++;

            if (!storage.report.assignee[key]) {
                storage.report.assignee[key] = {};
                storage.report.assignee[key].aggregatetimeoriginalestimate = 0;
                storage.report.assignee[key].aggregatetimespent = 0;
                storage.report.assignee[key].index = 0;
                storage.report.assignee[key].total = 0;
                storage.report.assignee[key].displayName = '';
                storage.report.assignee[key].data = [];
            }

            storage.report.assignee[key].displayName = issue.fields.assignee.displayName;
            storage.report.assignee[key].aggregatetimeoriginalestimate += issue.fields.aggregatetimeoriginalestimate;
            storage.report.assignee[key].aggregatetimespent += issue.fields.aggregatetimespent;
            storage.report.assignee[key].total++;

            data.aggregatetimeoriginalestimate = issue.fields.aggregatetimeoriginalestimate;
            data.aggregatetimespent = issue.fields.aggregatetimespent;

            if (issue.fields.issuetype.subtask) {
                issue = await getParent(issue);
            }

            data.epicName = await getEpicName(issue, epic, storage.url);
            data.isSubtask = issue.fields.issuetype.subtask;

            storage.report.epics.push(data.epicName);

            storage.report.assignee[key].data.push(data);
        }

        for (let [key, data] of Object.entries(storage.report.assignee)) {
            let report = storage.report.assignee[key];

            report.index = report.aggregatetimeoriginalestimate / report.aggregatetimespent;
        }

        storage.report.epics = [...new Set(storage.report.epics)];

        createReport(storage.report);

        console.log(storage);

    };

    let createReport = (data) => {
        let holder = document.getElementById('holder');
        let loading = document.getElementById('loading');
        let html = '<table class="table table-striped table-bordered table-hover"><tr><th>User</th><th>Index</th><th>Epics</th></tr>';
        let epics = '';
        let memberOfEpics;

        for (let epic of data.epics) {
            epics += `<label class="btn btn-primary active">
                        <input type="checkbox" autocomplete="off" checked id="${encodeURIComponent(epic)}"> ${epic}
                      </label>`;
        }

        html += `<div class="btn-group" data-toggle="buttons">${epics}</div>`;

        for (let assignee in data.assignee) {
            memberOfEpics = data.assignee[assignee].data.map((issue) => {
                return `<span class="${encodeURIComponent(issue.epicName)}">${issue.epicName}</span>`;
            });

            memberOfEpics = [...new Set(memberOfEpics)].join(', ');

            html += `<tr><td>${data.assignee[assignee].displayName}</td><td>${data.assignee[assignee].index}</td><td>${memberOfEpics}</td></tr>`
        }


        html += '</tr></table>';
        holder.innerHTML = html;

        loading.classList.add('hide');
        holder.classList.remove('hide');
    };

    let getStorage = () => {
        let loading = document.getElementById('loading');

        loading.classList.remove('hide');

        chrome.storage.local.get({
            'url': '',
            'login': '',
            'password': '',
            'jql': ''
        }, function (storage) {
            // getIndex(storage).then(data => createReport(data));
            getIndex(storage)
        })
    };


    let init = () => {
        Flatpickr.l10ns.default.firstDayOfWeek = 1;

        flatpickr('.flatpickr', {
            wrap: true,
            weekNumbers: true, // show week numbers
            maxDate: new Date()
        });

        document.querySelectorAll('input').forEach((input) => {
            input.addEventListener('onclick', () => {
                let data = {};

                data[input.id] = input.value;

                chrome.storage.local.set(data);
            })
        });

        document.getElementById('doIt').addEventListener('click', getStorage);

    };

    init();

}