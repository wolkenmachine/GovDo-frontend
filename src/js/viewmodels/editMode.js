viewModels.editMode = (function(){
	var state = false;
	var type = "";
	var content = {};

	return {
		state: function(){return state;},
		isType: function(t){return (type === t);},
		content: function(){return content;},

		setContent: function(key, value){
			content[key] = value;
		},

		set: function(t, c){
			state = true;
			type = t;
			if(c){
				content = JSON.parse(JSON.stringify(c)); //DEEP COPY CONTENT
			}
		},

		close: function(){
			state = false;
			type = "";
			content = {};
		},

		save: function(){
			console.log("save");
			if(type==="effort"){
				console.log("effort");
				if(content.id===-1){
					console.log("new");
					Models.Effort.newItem(content.name, content.type, content.People, function(id){
						viewModels.Hierarchy.updateEffort(content.id);
						viewModels.editMode.close();
					});
				} else {
					console.log("update");
					Models.Effort.updateItem(content.id, content.name, content.type, content.People, function(id){
						viewModels.Hierarchy.updateEffort(content.id);
						viewModels.editMode.close();
					});
				}
			}
		}
	};
})();
