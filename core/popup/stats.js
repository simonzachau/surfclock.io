window.onload = function() {
	stats.init();
}

var stats = {

	init: function() {

		stats.initResetControl();
		stats.initObservationControl();
		stats.initChart();
		stats.domain = getBackground().logger.domain;
		stats.update({
			'from' : 0,
			'till' : getBackground().getTimestamp()
		});
	},

	initObservationControl: function() {
		getBackground().database.getFirstIntervalStart().then(function(start) {
			const now = getBackground().getTimestamp();
			const totalDuration = now - start;

			const second = 1000;
			const minute = second * 60;
			const hour = minute * 60;
			const day = hour * 24;
			const scales = [second, minute, hour, day];

			var scaleIndex = 1;
			if(totalDuration > 3 * day) {
				scaleIndex = 3;
			} else if(totalDuration > 12 * hour) {
				scaleIndex = 2;
			}
			
			// subtract hour so that it starts at 00:00
			start = start - (start % scales[scaleIndex]) - hour; // start at round number

			var slider = document.getElementById('observationControl');

			// destroy the slider in case it already exists (necessary for Safari)
			if (slider.noUiSlider) {
				slider.noUiSlider.destroy();
			}

			noUiSlider.create(slider, {
				start: [start, now],
				connect: true, // display a colored bar between the handles
				behaviour: 'drag',
				// margin: scales[scaleIndex], // minimum between start and end
				// step: scales[scaleIndex],
				format: {
					from: Number,
					to: function(number) {
						return Math.round(number); // skip decimals
					}
				},
				range: {
					'min' : [start, scales[scaleIndex]],
					'75%' : [now - now % scales[scaleIndex], scales[scaleIndex - 1]],
					'max' : [now]
				},
			});
			
			// update preference and chart data when moving the slider is done
			slider.noUiSlider.on('change', function(values) {
		    	stats.update({
					'from' : values[0],
					'till' : values[1]
				});
			});
			
			// update slider duration while moving the slider
			slider.noUiSlider.on('slide', function(values) {
				const from = values[0];
				const till = values[1];
				stats.showObservationPeriod(from, till);
			});

			stats.showObservationPeriod(start, now);
		});
	},

	initResetControl: function() {
		document.getElementById('resetControl').onclick = function(e) {
			
			e.preventDefault();

			// delete entries from database
			// null means remove everything 
			getBackground().database.remove(null);

			// start a new interval
			getBackground().logger.reinstateDomain();

			// reload chart
			stats.update({
				'from' : 0,
				'till' : getBackground().getTimestamp()
			});
		};
	},

	initChart: function() {
		// destroy the chart in case it already exists (necessary for Safari)
		if(stats.chart) {
			stats.chart.destroy();
		}

		var canvas = document.getElementById('chart');
		var context = canvas.getContext('2d');

		stats.chart = new Chart(context, {
			type: 'doughnut',
			data: {
				labels: [],
				datasets: [{
					data: [],
					backgroundColor: [],
					hoverBackgroundColor: [],
					hoverBorderColor: 'white',
				}],
			},
			options: {
				cutoutPercentage: 83,
				legend: {
					display: false,
				},
				tooltips: {
					enabled: false,
				},
				hover: {
					onHover: function(e) {
						if (e[0]) {
							canvas.style.cursor = 'pointer';
							var index = e[0]._index;
							stats.domain = stats.chart.labels[index];
						} else {
							canvas.style.cursor = 'default';
						}
					},
				},
			}
		});

		Chart.pluginService.register({
			beforeRender: function (chart, easing) {
				stats.showDurations();
			},
			afterDraw: function(chart, easing) {
				stats.showIndicator();
			},
		});
	},

	update: function(observationBounds) {
		getBackground().database.getDomains().then(function(domains) {
			return domains.map(function(domain) {
				return new Promise(function(resolve, reject) {
					var entry = {
						'domain' : domain,
						'duration' : 0,
						'color' : '#EEEEEE',
					};
					// fetch color and duration in parallel
					Promise.all([
						// color
						new Promise(function(resolve, reject) {
							getBackground().database.getColor(domain).then(function(color) {
								entry.color = color ? color : '#EEEEEE';
								resolve();
							});
						}),
						// duration
						new Promise(function(resolve, reject) {
							getBackground().database.getDuration(domain, observationBounds).then(function(duration) {
								entry.duration = duration ? duration : 0;
								resolve();
							});
						})
					]).catch(function(error) {
						console.log(error);
					}).then(function() {
						resolve(entry);
					});
				});
			});
		}).then(function(promises) {
			Promise.all(promises).then(function(entries) {
				entries.sort((x, y) => y.duration - x.duration);
				entries = stats.handleSmallEntries(entries, 1.0);

				const domains = entries.map(x => x.domain);
				const durations = entries.map(x => x.duration);
				const colors = entries.map(x => x.color);

				stats.chart.labels = domains;
				stats.chart.data.datasets[0].data = durations;
				stats.chart.data.datasets[0].backgroundColor = colors;
				stats.chart.data.datasets[0].hoverBackgroundColor = colors;

				stats.chart.update();
			});
		});
	},

	// put everything smaller than x degrees into "other"; precondition: sorted
	handleSmallEntries: function(entries, thresholdDegrees) {
		const totalDuration = entries
		.map(x => x.duration)
		.reduce((total, duration) => total + duration, 0);

		var other = {
			'domain' : 'other',
			'duration' : 0,
			'color' : '#EEEEEE',
		};

		for (var i = entries.length - 1; i >= 0; i--) {;
			const entry = entries[i];
			if(entry.duration * 1.0 / totalDuration < thresholdDegrees / 360.0) {
				other.duration += entry.duration;
				entry.duration = 0;
			} else {
				break; // because we're iterating backwards, no smaller values will come
			}
		}

		entries.push(other);

		return entries;
	},

	showObservationPeriod: function(from, till) {
		moment.locale(window.navigator.userLanguage || window.navigator.language);

		// const start = moment(from).format('llll');
		// const end = moment(till).format('llll');

		const start = moment(from).calendar();
		const end = moment(till).calendar();

		const duration = stats.getPrettyTime(till - from);

		document.getElementById('text').innerHTML = '<b>' + start + ' - ' + end + '</b><br>' + duration + '';
	},

	showDurations: function() {
		// total
		const totalDuration = stats.chart.data.datasets[0].data.reduce((total, duration) => total + duration, 0);
		document.getElementById('totalDuration').innerHTML = totalDuration ? stats.getPrettyTime(totalDuration) : '0 minutes';	

		// domain
		if(stats.domain && stats.chart.labels && totalDuration) {
			const index = stats.chart.labels.indexOf(stats.domain);
			const domainDuration = stats.getDomainDuration(index);
			
			document.querySelector('#info p:last-of-type').style.display = 'block';
			document.getElementById('domain').innerHTML = stats.domain;
			document.getElementById('domainDuration').innerHTML = domainDuration ? stats.getPrettyTime(domainDuration) : '0 minutes';
		} else {
			document.querySelector('#info p:last-of-type').style.display = 'none';
		}
	},

	showIndicator: function() {
		if(stats.domain && stats.chart.labels) {
			const index = stats.chart.labels.indexOf(stats.domain);

			if(stats.getDomainDuration(index) > 0) {
				const arc = stats.chart.getDatasetMeta(0).data[index]._view;
				const angleRad = (arc.startAngle + arc.endAngle) / 2.0;
				const angleDeg = angleRad * 180.0 / Math.PI;

				// show
				document.getElementById('indicator').style.display = 'block';
				document.getElementById('indicator').style.transform = 'rotate(' + angleDeg + 'deg)';
				document.querySelector('#indicator div').style.background = arc.backgroundColor;
				
				return;
			}
		}
		
		// hide
		document.getElementById('indicator').style.display = 'none';
	},

	getDomainDuration(index) {
		return stats.chart.data.datasets[0].data[index];
	},

	getPrettyTime: function(milliseconds) {
		const duration = moment.duration(milliseconds, 'milliseconds');

		const minutes = duration.minutes();
		const hours = duration.hours();
		const days = duration.days();

		if(days + hours + minutes == 0) {
			return '< 1 minute';
		} else {
			function getTimePartString(timePart, timePartName) {
				return timePart ? ' ' + stats.numerus(timePart, timePartName) : '';
			};

			var time = '';
			time += getTimePartString(days, 'day');
			time += getTimePartString(hours, 'hour');
			time += getTimePartString(minutes, 'minute');

			time = time.slice(1);

			return time;
		}
	},

	numerus: function(number, word) {
		return (number > 1) ? (number + ' ' + word + 's') : (number + ' ' + word);
	},

	domain: null, // domain you chose to inspect details of
	
	chart: null

}
