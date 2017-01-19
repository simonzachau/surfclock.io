var database = new function() {
	
	this.dexie = new Dexie("domain_db");
	this.dexie.version(1).stores({
		intervals: '++id,domain,from,till',
		colors: '++id,domain,from'
	});

	this.dexie.open().catch(function(e) {
		alert("Open failed: " + e);
	});


	// this.dexie.intervals.clear();

	this.storeIntervalStart = function(domain, from) {
		database.dexie.intervals.add({
			'domain': domain,
			'from' : from 
		}).catch(function(error) {
			alert("error:" + JSON.stringify(error))
		});
	}

	this.storeIntervalEnd = function(domain, till) {

		database.dexie.intervals.where("domain").equals(domain).last().then(function (item) {

			 database.dexie.intervals.update(item.id, {'till' : till});
		}).catch(function(error) {
			alert("error:" + JSON.stringify(error))
		});

	}

	this.retrieve = function(callback) {

		var data = {};

		database.dexie.intervals.each(function(item){

			if (data[item.domain] == null) {
				data[item.domain] = [];
			} 

			data[item.domain].push({'from': item.from, 'till': item.till});

		}).then(function() {
			callback(data);
		});

	}

	this.remove = function(untilTime, callback) {
		if (untilTime) {
			// only remove until given time
			// TODO
		} else {
			database.dexie.intervals.clear();
			callback();
		}
	}
}
