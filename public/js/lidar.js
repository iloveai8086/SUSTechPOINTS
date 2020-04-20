
import * as THREE from './lib/three.module.js';
import { matmul, euler_angle_to_rotate_matrix, transpose, psr_to_xyz, array_as_vector_range, array_as_vector_index_range, vector_range, euler_angle_to_rotate_matrix_3by3} from "./util.js"
import { PCDLoader } from './lib/PCDLoader.js';
import { get_obj_cfg_by_type } from './obj_cfg.js';


import {settings} from "./settings.js"

function Lidar(sceneMeta, world, frameInfo){
    this.world = world;
    this.data = world.data;
    this.frameInfo = frameInfo;    
    this.sceneMeta = sceneMeta;
    this.coordinatesOffset = world.coordinatesOffset;
    
    this.points = null;
    this.points_load_time = 0;


    this.preload=function(on_preload_finished){
        this.on_preload_finished = on_preload_finished;

        var loader = new PCDLoader();

        var _self = this;
        loader.load( this.frameInfo.get_pcd_path(), 
            //ok
            function ( pcd ) {
                var position = pcd.position;
                var color = pcd.color;
                var normal = pcd.normal;

                _self.points_parse_time = new Date().getTime();
                console.log(_self.points_load_time, _self.frameInfo.scene, _self.frameInfo.frame, "parse pionts ", _self.points_parse_time - _self.create_time, "ms");

                if (_self.frameInfo.transform_matrix){

                    var arr = position;
                    var num = position.length;
                    var ni = 3;

                    for (var i=0; i<num/ni; i++){
                        var np = _self.frameInfo.transform_point(_self.frameInfo.transform_matrix, arr[i*ni+0], arr[i*ni+1], arr[i*ni+2]);
                        arr[i*ni+0]=np[0];
                        arr[i*ni+1]=np[1];
                        arr[i*ni+2]=np[2];
                    }

                    //points.geometry.computeBoundingSphere();
                }

                position = _self.transformPointsByOffset(position);

                // build geometry
                var geometry = new THREE.BufferGeometry();
                if ( position.length > 0 ) geometry.addAttribute( 'position', new THREE.Float32BufferAttribute( position, 3 ) );
                if ( normal.length > 0 ) geometry.addAttribute( 'normal', new THREE.Float32BufferAttribute( normal, 3 ) );
                if ( color.length > 0 ) {
                    geometry.addAttribute( 'color', new THREE.Float32BufferAttribute(color, 3 ) );
                }
                else {
                    color = []
                    for (var i =0; i< position.length; ++i){                                
                        color.push(_self.data.config.point_brightness);                                
                    }
                    geometry.addAttribute( 'color', new THREE.Float32BufferAttribute(color, 3 ) );
                }

                geometry.computeBoundingSphere();
                // build material

                var material = new THREE.PointsMaterial( { size: _self.data.config.point_size, vertexColors: THREE.VertexColors } );

                /*
                
                if ( color.length > 0 ) {
                    material.vertexColors = color;
                } else {
                    //material.color.setHex(0xffffff);
                    material.color.r = 0.6;
                    material.color.g = 0.6;
                    material.color.b = 0.6;
                }
                */

                //material.size = 2;
                material.sizeAttenuation = false;

                // build mesh

                var mesh = new THREE.Points( geometry, material );                        
                mesh.name = "pcd";

                //return mesh;

                
                _self.points = mesh;
                //_self.points_backup = mesh;

                _self.build_points_index();
                _self.points_load_time = new Date().getTime();

                console.log(_self.points_load_time, _self.frameInfo.scene, _self.frameInfo.frame, "loaded pionts ", _self.points_load_time - _self.create_time, "ms");

                _self._afterPreload();
            },

            // on progress,
            function(){

            },

            // on error
            function(){
                //error
                console.log("load pcd failed.");
                _self._afterPreload();
            },

            // on file loaded
            function(){
                _self.points_readfile_time = new Date().getTime();
                console.log(_self.points_load_time, _self.frameInfo.scene, _self.frameInfo.frame, "read file ", _self.points_readfile_time - _self.create_time, "ms");
            }
        );
    };

    this.deleteAll = function(){
        return this.remove_all_points();
    }

    this._afterPreload = function(){
        this.preloaded = true;
        console.log("lidar preloaded");
        //go ahead, may load picture
        if (this.on_preload_finished){
            this.on_preload_finished();
        }                
        if (this.go_cmd_received){
            this.go(this.webglScene, this.on_go_finished);
        }
    };


    this.loaded = false;
    this.webglScene  = null;
    this.go_cmd_received = false;
    this.on_go_finished = null;

    this.go = function(webglScene, on_go_finished){
        this.webglScene = webglScene;

        if (this.preloaded){
            this.webglScene.add(this.points);            
            this.loaded = true;


            if (!this.world.data.config.show_background){
                this.hide_background();
            }

            if (this.world.data.config.color_obj){
                this.color_points();
            }

            if (on_go_finished)
                on_go_finished();
        } else {
            this.go_cmd_received = true;
            this.on_go_finished = on_go_finished;
        }
    };

    this.unload = function(){
        this.cancel_highlight();

        if (this.points){
            this.webglScene.remove(this.points);

            // if (this.points.points_backup){
            //     let backup = this.points.points_backup;
            //     this.points.points_backup = null;
            //     this.remove_all_points();
            //     this.points = backup;

            // }
        }
    };

    this.deleteAll = function(){
        this.remove_all_points();
    }

    this.set_point_size=function(v){
        if (this.points){
            this.points.material.size = v;
        }

        if (this.points.points_backup){
            this.points.points_backup.material.size = v;

            if (this.points.points_backup.points_backup){
                this.points.points_backup.points_backup.material.size = v;
            }
        }
    };

    // color points according to object category
    this.color_points=function(){
        // color all points inside these boxes
        var _self = this;

        if (this.data.config.color_obj){
            this.world.annotation.boxes.map(function(b){
                _self.set_box_points_color(b);
            })

            this.update_points_color();
        }
    };


    this.transformPointsByOffset = function(points){
        let newPoints=[];
        points.forEach((p,i)=>{
            newPoints[i] = p + this.coordinatesOffset[i % 3];
        });

        return newPoints;
    };
    
    this.get_all_pionts=function(){
        return this.points.geometry.getAttribute("position");
    };
    
    this.build_points_index=function(){
        var ps = this.points.geometry.getAttribute("position");
        var points_index = {};

        if (ps){ // points may be empty
            for (var i = 0; i<ps.count; i++){
                var k = this.get_position_key(ps.array[i*3], ps.array[i*3+1], ps.array[i*3+2]);
                k = this.key_to_str(k);

                if (points_index[k]){
                    points_index[k].push(i);
                } else {
                    points_index[k]=[i];
                }                    
            }
        }

        this.points.points_index = points_index;
    };

    this.points_index_grid_size= 1,

    this.get_position_key=function(x,y,z){
        return [Math.floor(x/this.points_index_grid_size),
                Math.floor(y/this.points_index_grid_size),
                Math.floor(z/this.points_index_grid_size),];
    };
    this.key_to_str=function(k){
        return k[0]+","+k[1]+","+k[2];
    };

    // candidate pionts, covering the box(center, scale), but larger.
    this.get_covering_position_indices=function(points, center, scale, rotation, scale_ratio){
        /*
        var ck = this.get_position_key(center.x, center.y, center.z);
        var radius = Math.sqrt(scale.x*scale.x + scale.y*scale.y + scale.z*scale.z)/2;
        var radius_grid = Math.ceil(radius/this.points_index_grid_size);// + 1;

        var indices = [];
        for(var x = -radius_grid; x <= radius_grid; x++){
            for(var y = -radius_grid; y <= radius_grid; y++){
                for(var z = -radius_grid; z <= radius_grid; z++){
                    var temp = points.points_index[this.key_to_str([ck[0]+x, ck[1]+y, ck[2]+z])];
                    if (temp)
                        indices = indices.concat(temp);
                }
            }
        }

        console.log("found indices 1: " + indices.length);
        //return indices;
        */

        if (typeof(scale_ratio) == "number"){
            scale_ratio = {
                x: scale_ratio,
                y: scale_ratio,
                z: scale_ratio,
            };
        };

        var indices=[];
        
        var scaled_scale = {
            x: scale.x*scale_ratio.x,
            y: scale.y*scale_ratio.y,
            z: scale.z*scale_ratio.z,
        }

        var box_corners = psr_to_xyz(center, scaled_scale, rotation);
        var extreme = array_as_vector_range(box_corners, 4);

        var indices = [];
        for(var x = Math.floor(extreme.min[0]/this.points_index_grid_size); x <= Math.floor(extreme.max[0]/this.points_index_grid_size); x++){
            for(var y = Math.floor(extreme.min[1]/this.points_index_grid_size); y <= Math.floor(extreme.max[1]/this.points_index_grid_size); y++){
                for(var z = Math.floor(extreme.min[2]/this.points_index_grid_size); z <= Math.floor(extreme.max[2]/this.points_index_grid_size); z++){
                    var temp = points.points_index[this.key_to_str([x, y, z])];
                    if (temp)
                        indices = indices.concat(temp);
                }
            }
        }

        //console.log("found indices 2: " + indices.length);
        return indices;
    };

    this.toggle_background=function(){
        if (this.points.points_backup){ // cannot differentiate highlighted-scene and no-background-whole-scene
            this.cancel_highlight();
            return;
        } 
        else{
            this.hide_background();
        }
    };

    // hide all points not inside any box
    this.hide_background=function(){
        if (this.points.points_backup){
            //already hidden, or in highlight mode
            return;
        }

        var _self = this;
        var pos = this.points.geometry.getAttribute("position");
        var color = this.points.geometry.getAttribute("color");

        var hl_point=[];
        var hl_color=[];
        var highlight_point_indices = [];
        this.world.annotation.boxes.forEach(function(box){
            var indices= _self._get_points_index_of_box(_self.points, box, 1);

            indices.forEach(function(i){
                hl_point.push(pos.array[i*3]);
                hl_point.push(pos.array[i*3+1]);
                hl_point.push(pos.array[i*3+2]);

                hl_color.push(color.array[i*3]);
                hl_color.push(color.array[i*3+1]);
                hl_color.push(color.array[i*3+2]);
            })

            highlight_point_indices = highlight_point_indices.concat(indices);
        });
        

        // build new geometry
        var geometry = new THREE.BufferGeometry();
        
        if (hl_point.length > 0 ) {
            geometry.addAttribute( 'position', new THREE.Float32BufferAttribute(hl_point, 3 ) );
            geometry.addAttribute( 'color', new THREE.Float32BufferAttribute(hl_color, 3 ) );
        }
        
        
        geometry.computeBoundingSphere();               

        var material = new THREE.PointsMaterial( { size: _self.data.config.point_size, vertexColors: THREE.VertexColors } );

        material.sizeAttenuation = false;

        var mesh = new THREE.Points( geometry, material );                        
        mesh.name = "pcd";
        mesh.points_backup = this.points;
        mesh.highlight_point_indices = highlight_point_indices;

        //swith geometry
        this.webglScene.remove(this.points);

        this.points = mesh;       
        this.build_points_index();         
        this.webglScene.add(mesh);
    };

    this.cancel_highlight=function(box){
        if (this.points.points_backup){
            
            this.world.annotation.set_box_opacity(this.data.config.box_opacity);

            //copy colors, maybe changed.
            if (this.data.config.color_obj){
                var highlight_point_color = this.points.geometry.getAttribute("color");
                var backup_point_color = this.points.points_backup.geometry.getAttribute("color");                    
                
                this.points.highlight_point_indices.forEach(function(n, i){
                    backup_point_color.array[n*3] = highlight_point_color.array[i*3];
                    backup_point_color.array[n*3+1] = highlight_point_color.array[i*3+1];
                    backup_point_color.array[n*3+2] = highlight_point_color.array[i*3+2];
                });
            }


            //switch
            var points_backup = this.points.points_backup;
            this.points.points_backup = null;
            
            this.webglScene.remove(this.points);
            this.remove_all_points(); //this.points is null now
            this.points = points_backup;
            
            if (box){
                // in highlighted mode, the box my be moved outof the highlighted area, so 
                // we need to color them again.
                if (this.data.config.color_obj)
                    this.set_box_points_color(box);
            }

            if (this.data.config.color_obj)
                this.update_points_color();
                
            this.webglScene.add(this.points);
        }
    };

    this.reset_points=function(points){  // coordinates of points
        
        
        var geometry = new THREE.BufferGeometry();
        
        
        geometry.addAttribute( 'position', new THREE.Float32BufferAttribute(points, 3 ) );
        geometry.computeBoundingSphere();               

        var material = new THREE.PointsMaterial( { size: this.data.config.point_size} );

        material.sizeAttenuation = false;

        var mesh = new THREE.Points( geometry, material );                        
        mesh.name = "pcd";

        //swith geometry
        this.webglScene.remove(this.points);
        this.remove_all_points();

        this.points = mesh;
        this.webglScene.add(mesh);
    };

    this.highlight_box_points=function(box){
        if (this.points.highlighted_box){
            //already highlighted.
            return;
        }

        
        // hide all other boxes
        this.world.annotation.set_box_opacity(0);

        // keep myself
        box.material.opacity = 1;


        var _self = this;
        var pos = this.points.geometry.getAttribute("position");
        var color = this.points.geometry.getAttribute("color");

                        


        var hl_point=[];
        var hl_color=[];

        var highlight_point_indices= this._get_points_index_of_box(this.points, box, 3);

        highlight_point_indices.forEach(function(i){
            hl_point.push(pos.array[i*3]);
            hl_point.push(pos.array[i*3+1]);
            hl_point.push(pos.array[i*3+2]);

            hl_color.push(color.array[i*3]);
            hl_color.push(color.array[i*3+1]);
            hl_color.push(color.array[i*3+2]);
        })
        

        // build new geometry
        var geometry = new THREE.BufferGeometry();
        
        if (hl_point.length > 0 ) {
            geometry.addAttribute( 'position', new THREE.Float32BufferAttribute(hl_point, 3 ) );
            geometry.addAttribute( 'color', new THREE.Float32BufferAttribute(hl_color, 3 ) );
        }
        
        
        geometry.computeBoundingSphere();               

        var material = new THREE.PointsMaterial( { size: _self.data.config.point_size, vertexColors: THREE.VertexColors } );

        material.sizeAttenuation = false;

        var mesh = new THREE.Points( geometry, material );                        
        mesh.name = "pcd";

        //swith geometry
        this.webglScene.remove(this.points);

        mesh.points_backup = this.points;
        mesh.highlight_point_indices = highlight_point_indices;
        mesh.highlighted_box = box;

        this.points = mesh;
        this.build_points_index();
        this.webglScene.add(mesh);
    };

    this.get_points_indices_of_box=function(box){
        return this._get_points_of_box(this.points, box, 1).index;
    };

    this.get_points_of_box_in_box_coord=function(box){
        return this._get_points_of_box(this.points, box, 1).position;
    };

    // IMPORTANT
    // ground plane affects auto-adjustment
    // we don't count in the ponits of lowest part to reduce the affection.
    // note how the 'lower part' is defined, we count 
    // lowest_part_type has two options: lowest_point, or lowest_box
    this.get_points_dimmension_of_box=function(box, use_box_bottom_as_limit){
        var p = this._get_points_of_box(this.points, box, 1).position;  //position is relative to box coordinates

        var lowest_limit = - box.scale.z/2;

        if (!use_box_bottom_as_limit){
            var extreme1 = vector_range(p, 3);
            lowest_limit = extreme1.min[2];
        }
        

        //filter out lowest part
        var p = p.filter(function(x){
            return x[2] - settings.ground_filter_height > lowest_limit;
        })

        //compute range again.
        var extreme2 = vector_range(p, 3);

        return {
            max:{
                x: extreme2.max[0],
                y: extreme2.max[1],
                z: extreme2.max[2],
            },
            min:{
                x: extreme2.min[0],
                y: extreme2.min[1],
                z: lowest_limit,
            }
        }
    };

    // given points and box, calculate new box scale
    this.get_dimension_of_points=function(indices, box){
        var p = this._get_points_of_box(this.points, box, 1, indices).position;                
        var extreme1 = vector_range(p, 3);

        //filter out lowest part
        var p = p.filter(function(x){
            return x[2] - settings.ground_filter_height > extreme1.min[2];
        })

        //compute range again.
        var extreme2 = vector_range(p, 3);

        return {
            max:{
                x: extreme2.max[0],
                y: extreme2.max[1],
                z: extreme1.max[2],
            },
            min:{
                x: extreme2.min[0],
                y: extreme2.min[1],
                z: extreme1.min[2],
            }
        }
    };

    //centered, but without rotation
    this.get_points_relative_coordinates_of_box_wo_rotation=function(box, scale_ratio){
        return this._get_points_of_box(this.points, box, scale_ratio).position_wo_rotation;
    };


    this.get_points_of_box=function(box, scale_ratio){
        return this._get_points_of_box(this.points, box, scale_ratio);
    };


    this.get_points_relative_coordinates_of_box=function(box, scale_ratio){
        var ret = this._get_points_of_box(this.points, box, scale_ratio);
        return ret.position;
    };


    this._get_points_index_of_box=function(points, box, scale_ratio){
        return this._get_points_of_box(points, box, scale_ratio).index;
    };

    // this 
    this._get_points_of_box=function(points, box, scale_ratio, point_indices){

        if (!scale_ratio){
            scale_ratio = 1;
        }
        var pos_array = points.geometry.getAttribute("position").array;

        
        var relative_position = [];
        var relative_position_wo_rotation = [];
        
        var r = box.rotation;
        var trans = transpose(euler_angle_to_rotate_matrix(r, {x:0, y:0, z:0}), 4);

        var indices=[];
        var cand_point_indices = point_indices;
        if (!point_indices)
        {
            cand_point_indices = this.get_covering_position_indices(points, box.position, box.scale, box.rotation, scale_ratio);
        }

        cand_point_indices.forEach(function(i){
        //for (var i  = 0; i < pos.count; i++){
            var x = pos_array[i*3];
            var y = pos_array[i*3+1];
            var z = pos_array[i*3+2];

            var p = [x-box.position.x, y-box.position.y, z-box.position.z, 1];

            var tp = matmul(trans, p, 4);

            if (!point_indices){
                // if indices is provided by caller, don't filter
                if ((Math.abs(tp[0]) > box.scale.x/2 * scale_ratio+0.01) 
                    || (Math.abs(tp[1]) > box.scale.y/2 * scale_ratio+0.01)
                    || (Math.abs(tp[2]) > box.scale.z/2 *scale_ratio+0.01) ){
                    return;
                }

                indices.push(i);
            }
            
            relative_position.push([tp[0],tp[1],tp[2]]);
            relative_position_wo_rotation.push([p[0], p[1], p[2]])
            
        });
        
        //console.log("found indices: " + indices.length);

        return {
            index: indices,
            position: relative_position,
            position_wo_rotation: relative_position_wo_rotation,
        }
    };

    this.grow_box=function(box, min_distance, init_scale_ratio){

        var points = this.points;
        var pos_array = points.geometry.getAttribute("position").array;
        
        var trans = transpose(euler_angle_to_rotate_matrix(box.rotation, {x:0, y:0, z:0}), 4);

        var indices=[];
        var outer_indices=[];
        var cand_point_indices = this.get_covering_position_indices(points, box.position, box.scale, box.rotation, init_scale_ratio);
        
        var extreme= {
            max: {        
                x:-100000,
                y:-100000,
                z:-100000,
            },
    
            min: {        
                x:1000000,
                y:1000000,
                z:1000000,
            },
        };

        var scale_ratio = init_scale_ratio;
        cand_point_indices.forEach(function(i){
        //for (var i  = 0; i < pos.count; i++){
            var x = pos_array[i*3];
            var y = pos_array[i*3+1];
            var z = pos_array[i*3+2];

            var p = [x-box.position.x, y-box.position.y, z-box.position.z, 1];
            var tp = matmul(trans, p, 4);

            
            // if indices is provided by caller, don't filter
            if ((Math.abs(tp[0]) > box.scale.x/2 * scale_ratio.x+0.01) 
                || (Math.abs(tp[1]) > box.scale.y/2 * scale_ratio.y+0.01)
                || (Math.abs(tp[2]) > box.scale.z/2 *scale_ratio.z+0.01) ){
                outer_indices.push(i);
                return;
            }


            if (tp[0] > extreme.max.x) {
                extreme.max.x = tp[0];
            } 
            
            if (tp[0] < extreme.min.x){
                extreme.min.x = tp[0];
            }
    
            if (tp[1] > extreme.max.y){
                extreme.max.y = tp[1];
            }
            
            if (tp[1] < extreme.min.y){
                extreme.min.y = tp[1];
            }
    
            if (tp[2] > extreme.max.z){
                extreme.max.z = tp[2];
            }
            
            if (tp[2] < extreme.min.z){
                extreme.min.z = tp[2];
            }

            indices.push(i);
        });
        

        if (indices.length==0){
            return null;
        }

        for (var t_o in outer_indices){
            var o = outer_indices[t_o];
            for (var t_i in indices){
                var i = indices[t_i];
                var x = pos_array[i*3] - pos_array[o*3];
                var y = pos_array[i*3+1] - pos_array[o*3+1];
                var z = pos_array[i*3+2] - pos_array[o*3+2];

                if (x*x+y*y+z*z < min_distance*min_distance){
                    indices.push(o);

                    var p = [pos_array[o*3]-box.position.x, pos_array[o*3+1]-box.position.y, pos_array[o*3+2]-box.position.z, 1];
                    var tp = matmul(trans, p, 4);
                    if (tp[0] > extreme.max.x) {
                        extreme.max.x = tp[0];
                    } 
                    
                    if (tp[0] < extreme.min.x){
                        extreme.min.x = tp[0];
                    }
            
                    if (tp[1] > extreme.max.y){
                        extreme.max.y = tp[1];
                    }
                    
                    if (tp[1] < extreme.min.y){
                        extreme.min.y = tp[1];
                    }
            
                    if (tp[2] > extreme.max.z){
                        extreme.max.z = tp[2];
                    }
                    
                    if (tp[2] < extreme.min.z){
                        extreme.min.z = tp[2];
                    }

                    break;
                }
            }
        }
        
        extreme.max.x += 0.01;
        extreme.max.y += 0.01;
        extreme.max.z += 0.01;

        extreme.min.x -= 0.01;
        extreme.min.y -= 0.01;
        extreme.min.z -= 0.01;

        // return {
        //     index: indices,                 
        //     extreme: extreme,
        // }
        return extreme;
    };

    this.select_points_by_view_rect=function(x,y,w,h, camera){
        var points = this.points;
        var pos_array = points.geometry.getAttribute("position").array;

        var indices = [];
        var p = new THREE.Vector3();

        for (var i=0; i< pos_array.length/3; i++){
            p.set(pos_array[i*3], pos_array[i*3+1], pos_array[i*3+2]);
            p.project(camera);
            //p.x = p.x/p.z;
            //p.y = p.y/p.z;
            //console.log(p);
            if ((p.x > x) && (p.x < x+w) && (p.y>y) && (p.y<y+h) && (p.z>0)){
                indices.push(i);
            }
        }

        console.log("select rect points", indices.length);
        this.set_spec_points_color(indices, {x:1,y:0,z:0});
        this.update_points_color();
    };

    

    this.get_box_points_number=function(box){
        var indices = this._get_points_index_of_box(this.points, box, 1.0);
        return indices.length;
    };

    this.set_box_points_color=function(box, target_color){
        //var pos = this.points.geometry.getAttribute("position");
        var color = this.points.geometry.getAttribute("color");

        if (!target_color){
            var target_color_hex = parseInt("0x"+get_obj_cfg_by_type(box.obj_type).color.slice(1));
            target_color = {
                x: (target_color_hex/256/256)/255.0,
                y: (target_color_hex/256 % 256)/255.0,
                z: (target_color_hex % 256)/255.0,
            }
        }

        var indices = this._get_points_index_of_box(this.points, box, 1.0);
        indices.forEach(function(i){
            color.array[i*3] = target_color.x;
            color.array[i*3+1] = target_color.y;
            color.array[i*3+2] = target_color.z;
        });
    };

    this.set_spec_points_color=function(point_indices, target_color){
        //var pos = this.points.geometry.getAttribute("position");
        var color = this.points.geometry.getAttribute("color");
        
        point_indices.forEach(function(i){
            color.array[i*3] = target_color.x;
            color.array[i*3+1] = target_color.y;
            color.array[i*3+2] = target_color.z;
        });
    };

    // this is used when pointbrightness is updated.
    this.recolor_all_points = function(){
        this.set_points_color({
            x: this.data.config.point_brightness,
            y: this.data.config.point_brightness,
            z: this.data.config.point_brightness,
        });        
        this.color_points();  
        this.update_points_color();
    };

    // set all points to specified color
    this.set_points_color=function(target_color){
        var color = this.points.geometry.getAttribute("color");
        for (var i = 0; i<color.count; i++){
            color.array[i*3] = target_color.x;
            color.array[i*3+1] = target_color.y;
            color.array[i*3+2] = target_color.z;
        }
    };


    this.update_points_color=function(){
        if (this.points){ //some time points may fail to load.
            var color = this.points.geometry.getAttribute("color");
            this.points.geometry.removeAttribute("color");
            this.points.geometry.addAttribute("color", new THREE.Float32BufferAttribute(color.array, 3 ));
        }
    };


    this.remove_all_points=function(){
        if (this.points){
            this.points.geometry.dispose();
            this.points.material.dispose();
        
            
            if (this.points.points_backup){
                this.points.points_backup.geometry.dispose();
                this.points.points_backup.material.dispose();

                if (this.points.points_backup.points_backup){
                    this.points.points_backup.points_backup.geometry.dispose();
                    this.points.points_backup.points_backup.material.dispose();
                    this.points.points_backup.points_backup = null;
                }

                this.points.points_backup = null;
            }
            

            this.points = null;
        }else {            
            console.error("destroy empty world!");
        }
    };


    this.create_box_by_view_rect=function(x,y,w,h, camera, center){
        var rotation_z = camera.rotation.z + Math.PI/2;

        var points = this.points;
        var pos_array = points.geometry.getAttribute("position").array;

        var indices = [];
        var p = new THREE.Vector3();

        for (var i=0; i< pos_array.length/3; i++){
            p.set(pos_array[i*3], pos_array[i*3+1], pos_array[i*3+2]);
            p.project(camera);
            //p.x = p.x/p.z;
            //p.y = p.y/p.z;
            //console.log(p);
            if ((p.x > x) && (p.x < x+w) && (p.y>y) && (p.y<y+h) && (p.z>0)){
                indices.push(i);
            }
        }

        console.log("select rect points", indices.length);

        //compute center, no need to tranform to box coordinates, and can't do it in this stage.
        /*
        var extreme = array_as_vector_index_range(pos_array, 3, indices);

        var center = {
            x: (extreme.max[0]+extreme.min[0])/2,
            y: (extreme.max[1]+extreme.min[1])/2,
            z: (extreme.max[2]+extreme.min[2])/2,
        };
        */

        var trans = transpose(euler_angle_to_rotate_matrix({x:0,y:0,z:rotation_z}, {x:0, y:0, z:0}), 4);

        var relative_position = [];
        indices.forEach(function(i){
        //for (var i  = 0; i < pos.count; i++){
            var x = pos_array[i*3];
            var y = pos_array[i*3+1];
            var z = pos_array[i*3+2];
            var p = [x-center.x, y-center.y, z-center.z, 1];
            var tp = matmul(trans, p, 4);
            relative_position.push([tp[0],tp[1],tp[2]]);
        });

        var relative_extreme = vector_range(relative_position);
        var scale = {
            x: relative_extreme.max[0] - relative_extreme.min[0],
            y: relative_extreme.max[1] - relative_extreme.min[1],
            z: relative_extreme.max[2] - relative_extreme.min[2],
        };

        // enlarge scale a little


        // adjust center
        this.world.annotation.translate_box_position(center, rotation_z, "x", relative_extreme.min[0] + scale.x/2);
        this.world.annotation.translate_box_position(center, rotation_z, "y", relative_extreme.min[1] + scale.y/2);
        this.world.annotation.translate_box_position(center, rotation_z, "z", relative_extreme.min[2] + scale.z/2);
        

        scale.x += 0.02;
        scale.y += 0.02;
        scale.z += 0.02;

        return this.world.annotation.add_box(center, scale, {x:0,y:0,z:rotation_z}, "Unknown", "");
    };
}

export{Lidar}