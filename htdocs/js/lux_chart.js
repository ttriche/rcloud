LuxChart = {};

LuxChart.lux_tour_plot = function(array_list)
{
    var width = 600, height = 600;
    var canvas = $("<canvas></canvas>")[0]; // width='" + width + "' height='" + height + "'></canvas>")[0];
    canvas.width = width;
    canvas.height = height;
    var tour_batch;
    var data;
    var axis_1_parameters, axis_2_parameters;

    function data_buffers()
    {
        var result = {};
        var columns = [];
        for (var i=0; i<array_list.length; ++i) {
            result["dim_" + i] = Lux.attribute_buffer({
                vertex_array: new Float32Array(array_list[i]),
                item_size: 1,
                keep_array: true
            });
            columns.push("dim_" + i);
        }
        result.columns = columns;
        return result;
    };

    function init_webgl()
    {
        Lux.set_context(gl);
        data = data_buffers();

        var point_diameter = 10;
        var stroke_width   = 2.5;
        var point_alpha    = 1.0;
        
        axis_1_parameters = [];
        axis_2_parameters = [];
        var column_min, column_max, column_center = [];
        var xy_expression = Shade.vec(0, 0),
        xy_center = Shade.vec(0, 0),
        xy_distance = Shade.vec(0, 0);
        
        for (var i=0; i<data.columns.length; ++i) {
            var this_column = data[data.columns[i]];
            axis_1_parameters.push(Shade.parameter("float"));
            axis_2_parameters.push(Shade.parameter("float"));
            var axes = Shade.vec(axis_1_parameters[i],
                                 axis_2_parameters[i]);
            column_min = _.min(this_column.array);
            column_max = _.max(this_column.array);
            column_center = (column_max + column_min) / 2;
            xy_expression = xy_expression.add(axes.mul(this_column));
            xy_center = xy_center.add(axes.mul(column_center));
            xy_distance = xy_distance.add(axes.mul(column_center -
                                                   column_min).abs());
        };
        
        Lux.Scene.add(Lux.Marks.scatterplot({
            elements: data[data.columns[0]].numItems,
            xy: xy_expression,
            xy_scale: Shade.Scale.linear({domain: [xy_center.sub(xy_distance), xy_center.add(xy_distance)],
                                          range:  [Shade.vec(0,0), Shade.vec(1,1)]}),
            fill_color: Shade.color("red"),
            stroke_color: Shade.mix(Shade.color("black"), Shade.color("red"), 0.5),
            stroke_width: stroke_width,
            point_diameter: point_diameter
        }));
    }
    
    function random_2d_frame(dimension)
    {
        var v1 = [], v2 = [];
        var l1 = 0, l2 = 0;
        for (var i=0; i<dimension; ++i) {
            v1[i] = Math.random() * 2 - 1;
            v2[i] = Math.random() * 2 - 1;
            l1 += v1[i] * v1[i];
            l2 += v2[i] * v2[i];
        }
        l1 = Math.sqrt(l1);
        l2 = Math.sqrt(l2);
        // exceedingly unlikely; just try again.
        if (l1 === 0 || l2 === 0)
            return random_2d_frame(dimension);
        var d = 0;
        for (i=0; i<dimension; ++i) {
            v1[i] /= l1;
            v2[i] /= l2;
            d += v1[i] * v2[i];
        }
        var l = 0;
        for (i=0; i<dimension; ++i) {
            v2[i] = v2[i] - d * v1[i];
            l += v2[i] * v2[i];
        }
        l = Math.sqrt(l);
        // exceedingly unlikely; just try again.
        if (l === 0)
            return random_2d_frame(dimension);
        for (i=0; i<dimension; ++i) {
            v2[i] /= l;
        }
        return [v1, v2];
    }

    var gl = Lux.init({
        canvas: canvas,
        clearColor: [1,1,1,1]
    });

    init_webgl();
    var frame_1 = random_2d_frame(data.columns.length);
    var frame_2 = random_2d_frame(data.columns.length);
    var start = new Date().getTime();
    var prev_u = 1;

    Lux.Scene.animate(function() {
        var elapsed = (new Date().getTime() - start) / 1000;
        var u = elapsed/3;
        u -= Math.floor(u);
        if (u < prev_u) {
            frame_1 = frame_2;
            frame_2 = random_2d_frame(4);
        }
        prev_u = u;
        for (var i=0; i<data.columns.length; ++i) {
            axis_1_parameters[i].set(u*frame_2[0][i] + (1-u) * frame_1[0][i]);
            axis_2_parameters[i].set(u*frame_2[1][i] + (1-u) * frame_1[1][i]);
        }
    });
    return canvas;
};

LuxChart.lux_osm_plot = function(lats, lons, color, width, height)
{
    var canvas = $("<canvas></canvas>")[0]; // width='" + width + "' height='" + height + "'></canvas>")[0];
    canvas.width = width;
    canvas.height = height;
    var gl = Lux.init({
        canvas: canvas,
        clearColor: [1,1,1,1],
        mousedown: function(event) {
            var result = globe.mousedown(event);
            return result;
        },
        mousemove: function(event) {
            var result = globe.mousemove(event);
            return result;
        },
        mouseup: function(event) {
            var result = globe.mouseup(event);
            return result;
        }
    });

    var globe_zoom = Shade.parameter("float", 3.0);
    var view_proj = Shade.Camera.perspective({
        look_at: [Shade.vec(0, 0,  6),
                  Shade.vec(0, 0, -1),
                  Shade.vec(0, 1,  0)],
        field_of_view_y: Shade.div(20, globe_zoom)
    });

    var globe = Lux.Marks.globe({ 
        view_proj: view_proj,
        zoom: globe_zoom
    });

    lats = Lux.attribute_buffer({vertex_array: new Float32Array(lats), item_size: 1});
    lons = Lux.attribute_buffer({vertex_array: new Float32Array(lons), item_size: 1});
    // console.log(color);

    if (color.length === 3) {
        color = Shade.vec(color[0], color[1], color[2], 1);
    } else if (color.length > 1) {
        color = Shade.vec(Lux.attribute_buffer({vertex_array: new Float32Array(color), item_size: 3}), 1);
    }

    var dots_model = Lux.model({
        type: "points",
        lats: lats, 
        lons: lons
    });

    var dots_batch = Lux.bake(dots_model, {
        color: color,
        point_size: 2,
        position: globe.lat_lon_position(dots_model.lats.radians(), 
                                         dots_model.lons.radians())
    });

    Lux.Scene.add(globe);
    Lux.Scene.add(dots_batch);

    return canvas;
};
