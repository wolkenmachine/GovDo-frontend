var ptrn =  (function(){

	/*ATOM FACTORY*/
	function produceAtom(atom){
		var a = function(q, callback){
			var subset = selectRelations(atom.oid);
			return query(q, callback, subset);
		};

		//write temporary values
		a.update = function(input){
			atom.newvalue = input;
		};

		//drop temporary
		a.drop = function(){
			atom.drop = true;
			atom.newvalue = undefined;
		};

		a.transact = function(){
			if(atom.newvalue !== undefined){
				console.log("transact");
				atom.value.unshift({
					tid: transactions++,
					value: atom.newvalue
				});
				atom.newvalue = undefined;
				return true;
			}
			return false;
		};

		a.value = function(){
			if(atom.newvalue !== undefined){
				return atom.newvalue;
			}
			return atom.value[0].value;
		};

		a.type = function(){return atom.type;};
		a.id = function(){return atom.oid;};

		return a;
	}

	function produceRelation(rel){
		var r = function(){

		};

		r.a = function() {
			return produceAtom(atoms[rel.value[0].aid]);
		};

		r.b = function() {
			return produceAtom(atoms[rel.value[0].bid]);
		};

		return r;
	}

	/*STORE*/
	var atoms = [];
	var relations = [];
	var transactions = 0;

	/*STORAGE FUNCTIONS*/
	function create(type, value){
		var oid = atoms.length;
		var atom = {
			oid: oid,
			type: type,
			value: [
				{
					tid: transactions++,
					value: value
				}
			]
		};
		atoms.push(atom);
		return produceAtom(atom);
	}

	function drop(atom){
		atoms[atom.id()].value.unshift({
			tid: transactions++,
			drop: true
		});
		return produceAtom(atoms[atom.id()]);
	}

	function relate(a, b){
		var aid = a.id();
		var bid = b.id();

		var rid = relations.length;
		relations.push({
			rid: rid,
			value: [
				{
					tid: transactions++,
					aid: aid,
					bid: bid,
				}
			]
		});
	}

	function unrelate(a,b){
		var aid = a.id();
		var bid = b.id();

		relations.filter(function(relation){
			return ((relation.value[0].aid === aid && relation.value[0].bid === bid) || (relation.value[0].aid === bid && relation.value[0].bid === aid));
		}).map(function(relation){
			relations[relation.rid].value.unshift({
				tid: transactions++,
				drop: true
			});
		});
	}

	//convenience create and then relate
	function createrelate(type, value, a){
		var b = create(type, value);
		relate(a, b);
	}

	//convenience find one or create it
	function createorfind(type, value){
		var find = select(type, value);
		if(find.length > 0){
			return produceAtom(find[0]);
		} else {
			return create(type, value);
		}
	}

	//builds a list of atoms based on matches
	function select(type, value, subset){
		if(!subset){
			subset = atoms;
		}
		return subset.filter(function(atom){
			return (!atom.value[0].drop) && ((type==="?" || type===atom.type) && (value==="?" || value===atom.value[0].value));
		});
	}

	//builds a list of atoms from relations
	function selectRelations(id){
		var results = relations.filter(function(relation){
			return (!relation.value[0].drop) && (relation.value[0].aid === id || relation.value[0].bid === id);
		}).map(function(relation){
			if(relation.value[0].aid === id){
				return atoms[relation.value[0].bid];
			} else {
				return atoms[relation.value[0].aid];
			}
		});
		return results;
	}

	function compare(a, b){
		return (a && b && a.id()===b.id());
	}

	//transacts all the speculative changes
	function transact(){
		atoms.map(function(atom){
			produceAtom(atom).transact();
		});
	}


	/*INTERFACE*/
	function query(q, callback, subset){
		var n = parse(q);
		if(n.node==="selector"){
			var selection = select(n.type, n.value, subset);

			//if a callback is provided perform a map
			//otherwise just return the first element
			if(callback){
				return selection.map(function(atom){
					return callback(produceAtom(atom));
				});
			} else {
				return produceAtom(selection[0]);
			}
		}
		//var p = parse(q);
		//select(p.type, p.value);
	}

	function parse(q){
		var p = 0;
		function token(offset){
			return {
				type: function(type){
					if(tokens[p+offset]){
						return tokens[p+offset].type === type;
					}
					return false;
				},
				value: function(type){
					if(tokens[p+offset]){
						return tokens[p+offset].value;
					}
					return false;
				}
			};
		}

		function selector(){
			var type = "";
			var value = "";
			var tv = false;
			if(token(0).type("word")||token(0).type("string")||token(0).type("wildcard")){
				type = token(0).value();

				if(token(1).type("typevalue")){
					if(token(2).type("word")||token(2).type("string")||token(2).type("wildcard")){
						value = token(2).value();
						return {
							node: "selector",
							type: type,
							value: value
						};
					}
				} else {
					return {
						node: "selector",
						type: type,
						value: "?"
					};
				}

			} else {
				return false;
			}
		}

		var tokens = tokenize(q);
		return selector();
	}

	function tokenize(q){
		var chars = q.split("");
		var tokens = [];
		var token = {
			value: "",
			type: ""
		};

		function newToken(v,t){
			token.value = v;
			token.type = t;
		}

		function writeToken(v){
			token.value = token.value + v;
		}

		function pushToken(){
			tokens.push({
				value: token.value,
				type: token.type,
			});
			token.value = "";
			token.type = "";
		}

		for(var i=0; i<chars.length; i++){
			var c = chars[i];

			//state new token
			if(token.type === "") { //state = new token
				if(c===":"){
					newToken(c, "typevalue");
					pushToken();
				} else if(c==="?"){
					newToken(c, "wildcard");
					pushToken();
				} else if(c==="'"){
					newToken("", "string");
				} else {
					newToken(c, "word");
				}
				continue;
			}

			//state inside string
			if(token.type === "string") {
				if(c==="'"){
					pushToken();
				} else {
					writeToken(c);
				}
				continue;
			}

			//state inside word
			if(token.type === "word") {
				if(c===" "){
					pushToken();
				} else if(c===":" || c==="?"){
					pushToken();
					i--;
				} else {
					writeToken(c);
				}
				continue;
			}
		}

		if(token.type !== ""){
			pushToken();
		}

		return tokens;

	}

	function log(){
		console.log(transactions);
	}


	/*PUBLIC INTERFACE*/
	query.create = create;
	query.drop = drop;
	query.relate = relate;
	query.unrelate = unrelate;

	query.createrelate = createrelate;
	query.createorfind = createorfind;

	query.transact = transact;

	query.compare = compare;
	query.log = log;
	return query;
})();


model.get("overview", {}, function(data){
	data.map(function(domain){
		var d = ptrn.create("domain", domain.name);
		domain.Programs.map(function(program){
			var p = ptrn.create("program", program.name);
			ptrn.createrelate("mission", program.mission, p);
			ptrn.createrelate("order", program.id, p);

			ptrn.relate(d,p);
			program.Tasks.map(function(task){
				var t = ptrn.create("task", task.name);
				ptrn.createrelate("means", task.means, t);
				ptrn.createrelate("kpi", task.kpi, t);
				ptrn.createrelate("order", task.id, t);
				ptrn.createrelate("mode", task.mode, t);

				ptrn.relate(p,t);
				task.Efforts.map(function(effort){
					var e = ptrn.create("effort", effort.name);
					ptrn.createrelate("description", effort.description, e);
					ptrn.createrelate("endproduct", effort.endproduct, e);
					ptrn.createrelate("type", effort.type, e);
					ptrn.createrelate("order", effort.id, e);
					ptrn.createrelate("mode", effort.mode, e);
					ptrn.relate(t,e);

					effort.People.map(function(person){
						var p = ptrn.createorfind("person", person.name);
						ptrn.relate(p,e);
					});
				});
			});
		});
	});
});
