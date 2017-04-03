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

    let getIndex = async (storage) => {
        let lookups = [];

        headers = new Headers({
            'Authorization': 'Basic ' + toBase64(storage.login + ':' + storage.password),
            'Content-Type': 'application/json'
        });

        const epic = await getEpicInfo(storage.url);

        return new Promise((resolve, reject) => {
                storage.fromDate = document.getElementById('dateFrom').value;
                storage.toDate = document.getElementById('dateTo').value;

                let logDates = ` AND updatedDate >= ${storage.fromDate} AND updatedDate <= ${storage.toDate}`;

                fetch(`${storage.url}/rest/api/2/field`, {
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

                        storage.epic = {};
                        storage.epic.name = name.id;
                        storage.epic.link = link.id;

                    }).then(
                    fetch(`${storage.url}/rest/api/2/search?jql=${storage.jql + logDates}&maxResults=1000`, {
                        method: 'GET',
                        redirect: 'follow',
                        headers: headers
                    })
                        .then(response => {
                            return response.json()
                        })
                        .then(jiras => {
                                storage.fromDate = new Date(storage.fromDate);
                                storage.toDate = new Date(storage.toDate);
                                storage.report = {};
                                storage.report.assignee = {};
                                storage.report.total = 0;
                                storage.report.issues = {};

                                for (let issue of jiras.issues) {
                                    let key = issue.fields.assignee.key;
                                    let data = {};

                                    storage.report.total++;

                                    if (!storage.report.assignee[key]) {
                                        storage.report.assignee[key] = {};
                                        storage.report.assignee[key].aggregatetimeoriginalestimate = 0;
                                        storage.report.assignee[key].aggregatetimespent = 0;
                                        storage.report.assignee[key].index = 0;
                                        storage.report.assignee[key].total = 0;
                                        storage.report.assignee[key].displayName = '';
                                        storage.report.assignee[key].data = [];
                                        storage.report.assignee[key].epic = '';
                                    }

                                    storage.report.assignee[key].displayName = issue.fields.assignee.displayName;
                                    storage.report.assignee[key].aggregatetimeoriginalestimate += issue.fields.aggregatetimeoriginalestimate;
                                    storage.report.assignee[key].aggregatetimespent += issue.fields.aggregatetimespent;
                                    storage.report.assignee[key].isSubtask = issue.fields.issuetype.subtask;
                                    storage.report.assignee[key].total++;

                                    data.aggregatetimeoriginalestimate = issue.fields.aggregatetimeoriginalestimate;
                                    data.aggregatetimespent = issue.fields.aggregatetimespent;

                                    storage.report.assignee[key].data.push(data);

                                    if (storage.report.assignee[key].isSubtask) {
                                        lookups.push(
                                            fetch(issue.fields.parent.self, {
                                                method: 'GET',
                                                redirect: 'follow',
                                                headers: headers,
                                                data: storage.report.assignee[key]
                                            })
                                                .then(response => {
                                                    return response.json()
                                                })
                                                .then(parentIssue => {

                                                    lookups.push(setEpicName(data, parentIssue, storage.epic, storage.url));
                                                })
                                        )
                                    } else {
                                        lookups.push(setEpicName(storage.report.assignee[key], issue, storage.epic, storage.url));
                                    }
                                }

                                Promise.all(lookups).then(() => {
                                    console.table(storage.report);
                                    resolve(storage.report);
                                }, reason => {
                                    debugger;
                                    console.log(reason);
                                    reject(reason);
                                });
                            }
                        )
                )
            }
        )
    };

    let setEpicName = (data, issue, epic, url) => {
        return fetch(`${url}/rest/api/2/issue/${issue.fields[epic.link]}`, {
            method: 'GET',
            redirect: 'follow',
            headers: headers
        })
            .then(response => {
                return response.json()
            })
            .then(thisEpic => {
                data.epic = thisEpic.fields[epic.name];
            })
    };

    let createReport = (data) => {
        let holder = document.getElementById('holder');
        let loading = document.getElementById('loading');
        let total = 0;
        let html = '<h3>Total hours for period: <span id="total"></span></h3><table class="table table-striped table-bordered table-hover"><tr><th>ID</th><th>Summary</th><th>Status</th><th>User</th><th>Date</th><th>Hours</th></tr>';

        for (let [key, value] of Object.entries(data)) {
            if (key === 'total') {
                total = value;
            } else {
                for (let [key, data] of Object.entries(value)) {
                    const row = `<tr><td>${key}</td><td>${data.details.summary}</td><td>${data.details.status}</td>`;
                    let thisDetails = '';

                    for (let log of data.data) {
                        thisDetails += `${row}<td>${log.displayName}</td><td>${log.updated}</td><td>${log.timeSpentSeconds / 3600}</td></tr>`;
                    }

                    html += thisDetails;
                }
            }
        }

        html += '</tr></table>';
        debugger;
        holder.innerHTML = html;
        document.getElementById('total').innerHTML = parseInt(data.total) / 3600;

        loading.classList.add('bounceOut');
        holder.classList.add('bounceIn');
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