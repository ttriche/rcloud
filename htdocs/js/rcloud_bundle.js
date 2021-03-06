// bare-bones d3 charting facilities

(function() {

function svg_translate(dx, dy)
{
    return "translate(" + dx + "," + dy + ")";
}

Chart = {};

function array_remove(array, from, to) {
    var rest = array.slice((to || from) + 1 || array.length);
    array.length = from < 0 ? array.length + from : from;
    return array.push.apply(array, rest);
};

var models = {};
var selections = {};
function add_data_model(model, group_id)
{
    if (_.isUndefined(models[group_id])) {
        var selection = new Uint8Array(model.data().length);
        selections[group_id] = selection;
        models[group_id] = [model];
    } else {
        models[group_id].push(model);
    }
}

Chart.get_selections = function(group_id) {
    return selections[this.group_id];
}

Chart.set_selections = function(group_id, sel) {
    for (var i = 0; i < sel.length; i++)
	selections[group_id][i] = sel[i];
    _.each(models[group_id], function(model) {
        _.each(model.views, function(v) {
            v.selection_changed();
        });
    });
}

Chart.data_model = function(data, group_id)
{
    var l = data.length;
    // I use typed arrays because this might be useful in Facet eventually
    var result = {
        views: {},
        group_id: group_id,
        data: function() { return data; },
        selection: function() { return selections[this.group_id]; },

        // toggle_selection: function(
        register_view: function(v) { this.views[v._view_index] = v; },
        deregister_view: function(v) { delete this.views[v._view_index]; },
        notify: function() {
            _.each(models[this.group_id], function(model) {
                _.each(model.views, function(v) {
                    v.selection_changed();
                });
            });
        },
        clear_brushes: function(active_view) {
            _.each(models[this.group_id], function(model) {
                _.each(model.views, function(v) {
                    if (v._view_index !== active_view._view_index) {
                        console.log("clearing brush on view", v._view_index, v, active_view);
                        v.clear_brush();
                    }
                });
            });
        }
    };
    add_data_model(result, group_id);

    return result;
};

var view_counter = 0;

function enforce_function(v)
{
    if (typeof v === "function") return v;
    return (function(val) {
        return function() { return val; };
    })(v);
}

Chart.scatterplot = function(opts)
{
    opts = _.defaults(opts, {
        width: 400,
        height: 400,
        padding: 20,
        n_xticks: 10,
        n_yticks: 10,
        stroke: "white",
        stroke_width: "1.5px",
        fill: "black",
        stroke_opacity: 1.0,
        fill_opacity: 1.0
    });

    opts.stroke = enforce_function(opts.stroke);
    opts.stroke_opacity = enforce_function(opts.stroke_opacity);
    opts.stroke_width = enforce_function(opts.stroke_width);
    opts.fill = enforce_function(opts.fill);
    opts.fill_opacity = enforce_function(opts.fill_opacity);

    var width = opts.width, height = opts.height, padding = opts.padding;
    var model = opts.data;
    var data = model.data();
    
    var x_values = _.map(data, opts.x);
    var y_values = _.map(data, opts.y);
    var x_min = _.min(x_values), x_max = _.max(x_values);
    var y_min = _.min(y_values), y_max = _.max(y_values);

    var x_scale = d3.scale.linear().domain([x_min, x_max]).range([0, width]);
    var y_scale = d3.scale.linear().domain([y_min, y_max]).range([height, 0]);

    var output_div = $("<div></div>")[0];

    var result = {
        _view_index: ++view_counter,
        opts: opts,
        plot: output_div,
        clear_brush: function() {
            vis.call(brush.clear());
        }, selection_changed: function() {
            update_selection();
        }, deleted: function() {
            model.deregister_view(this);
        }
    };

    model.register_view(result);

    var svg = d3.select(output_div)
        .append("svg")
           .attr("width", width + 2 * padding)
           .attr("height", height + 2 * padding);

    var vis = svg
        .append("g")
           .attr("transform", svg_translate(padding, padding));

    var brush = d3.svg.brush()
        .on("brushstart", brushstart)
        .on("brush", brushevt)
        .on("brushend", brushend);

    vis.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "#eee");

    var xrule = vis.selectAll("g.x")
        .data(x_scale.ticks(opts.n_xticks))
        .enter().append("g")
        .attr("class", "x");

    xrule.append("line")
        .attr("x1", x_scale).attr("x2", x_scale)
        .attr("y1", 0).attr("y2", height);

    xrule.append("text")
        .attr("x", x_scale)
        .attr("y", height + 3)
        .attr("dy", ".71em")
        .attr("text-anchor", "middle")
        .attr("class", "rule-text")
        .text(x_scale.tickFormat(opts.n_xticks));

    var yrule = vis.selectAll("g.y")
        .data(y_scale.ticks(opts.n_yticks))
        .enter().append("g")
        .attr("class", "x");

    yrule.append("line")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", y_scale).attr("y2", y_scale);

    yrule.append("text")
        .attr("x", -3)
        .attr("y", y_scale)
        .attr("dy", ".35em")
        .attr("text-anchor", "end")
        .attr("class", "rule-text")
        .text(y_scale.tickFormat(opts.n_yticks));

    var dots = vis.selectAll("path.dot")
        .data(_.range(data.length))
        .enter().append("path");

    var selected_dots = vis.selectAll("pathasdkf.dot")
        .data(_.range(data.length))
        .enter().append("path");

    var d = function(d) { return data[d]; };

    dots.style("fill", _.compose(opts.fill, d))
        .style("stroke", _.compose(opts.stroke, d))
        .style("fill-opacity", _.compose(opts.fill_opacity, d))
        .style("stroke-opacity", _.compose(opts.stroke_opacity, d));

    vis.call(brush.x(x_scale).y(y_scale));

    var selection_fill = function() { return "red"; };
    var selection_stroke = function() { return "red"; };
    var selection_fill_opacity = function() { return 1.0; };
    var selection_stroke_opacity = function() { return 1.0; };

    selected_dots.style("fill", _.compose(selection_fill, d))
        .style("stroke", _.compose(selection_stroke, d))
        .style("fill-opacity", _.compose(selection_fill_opacity, d))
        .style("stroke-opacity", _.compose(selection_stroke_opacity, d));

    function update_selection() {
        var selection = model.selection();
        selected_dots
            .attr("display", function(d) {
                return selection[d]?null:"none"; 
            })
        ;
    };

    function place_dots(selection) {
        selection
            .attr("d", d3.svg.symbol().type("circle"))
            .attr("size", 5)
            .attr("transform", function(d) {
                d = data[d];
                return svg_translate(x_scale(opts.x(d)), 
                                     y_scale(opts.y(d))); 
            })
            .style("stroke-width", function(d) { 
                return result.opts.stroke_width(data[d]);
            });
    }

    function brushstart(p) {
        model.clear_brushes(result);
    }

    function brushevt(p) {
        var e = brush.extent();
        var selection = model.selection();
        dots.each(function(d) {
            var v = data[d];
            var b = (e[0][0] <= opts.x(v) && opts.x(v) <= e[1][0] &&
                     e[0][1] <= opts.y(v) && opts.y(v) <= e[1][1]);
            selection[d] = b;
        });
        model.notify();
    }
    function brushend() {
        if (brush.empty())
            update_selection(dots);
    }

    svg.on("keydown", function(e) {
        console.log(e);
    });

    place_dots(dots);
    place_dots(selected_dots);
    update_selection();
    return result;
};

Chart.histogram = function(opts)
{
    opts = _.defaults(opts, {
        width: 400,
        height: 400,
        padding: 20,
        n_bins: 10,
        stroke: "white",
        stroke_width: "1.5px",
        fill: "black",
        stroke_opacity: 1.0,
        fill_opacity: 1.0
    });

    opts.stroke = enforce_function(opts.stroke);
    opts.stroke_opacity = enforce_function(opts.stroke_opacity);
    opts.stroke_width = enforce_function(opts.stroke_width);
    opts.fill = enforce_function(opts.fill);
    opts.fill_opacity = enforce_function(opts.fill_opacity);

    var width = opts.width, height = opts.height, padding = opts.padding;
    var model = opts.data;
    var data = model.data();

    var x_values = _.map(data, opts.x);
    var x_min = _.min(x_values), x_max = _.max(x_values);

    var output_div = $("<div></div>")[0];
    var x_scale = d3.scale.linear().domain([x_min, x_max]).range([0, width]);

    var hist = d3.layout.histogram()
        .range([x_min, x_max])
        .bins(opts.n_bins);

    var bins = hist(opts.x);

    var result = {
        _view_index: ++view_counter,
        opts: opts,
        plot: output_div,
        clear_brush: function() {
            vis.call(brush.clear());
        }, selection_changed: function() {
            update_selection();
        }, deleted: function() {
            model.deregister_view(this);
        }
    };

    // model.register_view(result);

    // var svg = d3.select(output_div)
    //     .append("svg")
    //        .attr("width", width + 2 * padding)
    //        .attr("height", height + 2 * padding);

    // var vis = svg
    //     .append("g")
    //        .attr("transform", svg_translate(padding, padding));

    // var brush = d3.svg.brush()
    //     .on("brushstart", brushstart)
    //     .on("brush", brushevt)
    //     .on("brushend", brushend);

    // vis.append("rect")
    //     .attr("width", width)
    //     .attr("height", height)
    //     .attr("fill", "#eee");

    // var xrule = vis.selectAll("g.x")
    //     .data(x_scale.ticks(opts.n_xticks))
    //     .enter().append("g")
    //     .attr("class", "x");

    // xrule.append("line")
    //     .attr("x1", x_scale).attr("x2", x_scale)
    //     .attr("y1", 0).attr("y2", height);

    // xrule.append("text")
    //     .attr("x", x_scale)
    //     .attr("y", height + 3)
    //     .attr("dy", ".71em")
    //     .attr("text-anchor", "middle")
    //     .attr("class", "rule-text")
    //     .text(x_scale.tickFormat(opts.n_xticks));

    // var yrule = vis.selectAll("g.y")
    //     .data(y_scale.ticks(opts.n_yticks))
    //     .enter().append("g")
    //     .attr("class", "x");

    // yrule.append("line")
    //     .attr("x1", 0).attr("x2", width)
    //     .attr("y1", y_scale).attr("y2", y_scale);

    // yrule.append("text")
    //     .attr("x", -3)
    //     .attr("y", y_scale)
    //     .attr("dy", ".35em")
    //     .attr("text-anchor", "end")
    //     .attr("class", "rule-text")
    //     .text(y_scale.tickFormat(opts.n_yticks));

    // var dots = vis.selectAll("path.dot")
    //     .data(_.range(data.length))
    //     .enter().append("path");

    // var selected_dots = vis.selectAll("pathasdkf.dot")
    //     .data(_.range(data.length))
    //     .enter().append("path");

    // var d = function(d) { return data[d]; };

    // dots.style("fill", _.compose(opts.fill, d))
    //     .style("stroke", _.compose(opts.stroke, d))
    //     .style("fill-opacity", _.compose(opts.fill_opacity, d))
    //     .style("stroke-opacity", _.compose(opts.stroke_opacity, d));

    // vis.call(brush.x(x_scale).y(y_scale));

    // var selection_fill = function() { return "red"; };
    // var selection_stroke = function() { return "red"; };
    // var selection_fill_opacity = function() { return 1.0; };
    // var selection_stroke_opacity = function() { return 1.0; };

    // selected_dots.style("fill", _.compose(selection_fill, d))
    //     .style("stroke", _.compose(selection_stroke, d))
    //     .style("fill-opacity", _.compose(selection_fill_opacity, d))
    //     .style("stroke-opacity", _.compose(selection_stroke_opacity, d));

    // function update_selection() {
    //     var selection = model.selection();
    //     selected_dots
    //         .attr("display", function(d) {
    //             return selection[d]?null:"none"; 
    //         })
    //     ;
    // };

    // function place_dots(selection) {
    //     selection
    //         .attr("d", d3.svg.symbol().type("circle"))
    //         .attr("size", 5)
    //         .attr("transform", function(d) {
    //             d = data[d];
    //             return svg_translate(x_scale(opts.x(d)), 
    //                                  y_scale(opts.y(d))); 
    //         })
    //         .style("stroke-width", function(d) { 
    //             return result.opts.stroke_width(data[d]);
    //         });
    // }

    // function brushstart(p) {
    //     model.clear_brushes(result);
    // }

    // function brushevt(p) {
    //     var e = brush.extent();
    //     var selection = model.selection();
    //     dots.each(function(d) {
    //         var v = data[d];
    //         var b = (e[0][0] <= opts.x(v) && opts.x(v) <= e[1][0] &&
    //                  e[0][1] <= opts.y(v) && opts.y(v) <= e[1][1]);
    //         selection[d] = b;
    //     });
    //     model.notify();
    // }
    // function brushend() {
    //     if (brush.empty())
    //         update_selection(dots);
    // }

    // svg.on("keydown", function(e) {
    //     console.log(e);
    // });

    // place_dots(dots);
    // place_dots(selected_dots);
    // update_selection();
    // return result;
};

})();
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
(function() {

// takes a string and returns the appropriate r literal string with escapes.
function escape_r_literal_string(s) {
    return (s == null) ? "NULL" : ("\"" + s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"");
}

function NoCallbackError() {
    this.name = "NoCallbackError";
}

NoCallbackError.prototype = Object.create(Error);
NoCallbackError.prototype.constructor = NoCallbackError;

function no_callback() { throw new NoCallbackError(); }

RClient = {
    create: function(opts) {

        function on_connect() {
            result.running = true;
            result.send("rcloud.support::session.init(username=" 
                        + escape_r_literal_string(rcloud.username()) + ",token="
                        + escape_r_literal_string(rcloud.github_token()) + ")");
            opts.on_connect && opts.on_connect.call(result);
        }

        // this might be called multiple times; some conditions result
        // in on_error and on_close both being called.
        function shutdown() {
            $("#input-div").hide();
        }

        function on_error(msg, status_code) { 
            if (status_code === 65) {
                // Authentication failed.
                result.post_error("Authentication failed. Login first!");
            } else {
                result.post_error(msg);
            }
            shutdown();
        }

        function on_close(msg) {
            result.post_error("Socket was closed. Goodbye!");
            shutdown();
        };

        var token = $.cookies.get().token;  // document access token
        var execToken = $.cookies.get().execToken; // execution token (if enabled)
        var rserve = Rserve.create({
            host: opts.host,
            on_connect: on_connect,
            on_error: on_error,
            on_close: on_close,
            on_data: opts.on_data,
            login: token + "\n" + execToken
        });

        var _debug = opts.debug || false;
        var _capturing_answers = false;
        var _capturing_callback = undefined;

        var result;

        result = {
            handlers: {
                "eval": function(v) {
                    result.post_response(v);
                    return v;
                },
                "markdown.eval": function(v) {
                    result.display_markdown_response(v);
                    return v;
                },
                "browsePath": function(v) {
                    $.ajax({ url: "http://127.0.0.1:8080" + v }).done(function(result) {
                        // horrible hack: we strip the content down to its main div via regexp
                        // cue jwz here.
                        var inside_body = /[\s\S]*<body>([\s\S]*)<\/body>/g.exec(result)[1];
                        $("#help-output").html(inside_body);
                    });
                },
		// FIXME: I couldn't get this.post_* to work from here so this is just to avoid the error ... it's nonsensical, obviously
		"dev.new": function(v) { return ""; },
		"dev.close": function(v) { return ""; },
                "internal_cmd": function(v) { return ""; },
                "boot.failure": function(v) { 
                    result.running = false;
                }
            },
            running: false,

            eval: function(data) {
                var that = this;
                if (data.type !== "sexp") {
                    return this.post_error("Bad protocol, should always be sexp.");
                }
                data = data.value;
                if (data.type === "string_array") {
                    return this.post_error(data.value[0]);
                }
                if (data.type === "null") {
                    return null;
                }
                if (data.type !== "vector") {
                    return this.post_error("Protocol error, unexpected value of type " + data.type);
                }
                if (data.value[0].type !== "string_array" ||
                    data.value[0].value.length !== 1) {
                    console.log("Protocol error?! ", data.value[0]);
                    return undefined;
                    // return this.post_error("Protocol error, expected first element to be a single string");
                }
                var cmd = data.value[0].value[0];
                var cmds = this.handlers;
                if (cmds[cmd] === undefined) {
                    return this.post_error("Unknown command " + cmd);
                }
                return cmds[cmd].call(this, data.json()[1]);
            },

            register_handler: function(cmd, callback) {
                this.handlers[cmd] = callback;
            },

            //////////////////////////////////////////////////////////////////
            // FIXME: all of this should move out of rclient and into
            // the notebook objects.

            post_div: function (msg) {
                return shell.post_div(msg);
            },

            display_markdown_response: function(result) {
                if (result) {
                    $("#output")
                        .append($("<div></div>")
                                .html(result.value[0]))
                        .find("pre code")
                        .each(function(i, e) { 
                            hljs.highlightBlock(e); 
                        });
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
                }
            },

            //////////////////////////////////////////////////////////////////

            post_error: function (msg) {
                var d = $("<div class='alert alert-error'></div>").text(msg);
                $("#output").append(d);
                window.scrollTo(0, document.body.scrollHeight);
            },

            post_response: function (msg) {
                var d = $("<pre></pre>").html(msg);
                $("#output").append(d);
                window.scrollTo(0, document.body.scrollHeight);
            },

            capture_answers: function (how_many, callback) {
                if (_capturing_answers) {
                    throw "Still waiting for previous answers...";
                }
                _capturing_answers = true;
                var result = [];
                function blip(msg) {
                    result.push(msg);
                    how_many--;
                    if (how_many === 0) {
                        _capturing_answers = false;
                        _capturing_callback = undefined;
                        callback(result);
                    }
                }
                _capturing_callback = blip;
            },

            wrap_command: function(command, silent) {
                // FIXME code injection? notice that this is already eval, so
                // what _additional_ harm would exist?
                if (silent === undefined) {
                    silent = false;
                }
                return "rcloud.support::session.eval({" + command + "}, "
                    + (silent?"TRUE":"FALSE") + ")";
            },

            markdown_wrap_command: function(command, silent) {
                return "rcloud.support::session.markdown.eval({markdownToHTML(text=paste(knit(text=" + escape_r_literal_string(command+'\n') + "), collapse=\"\\n\"), fragment=TRUE)}, "
                    + (silent?"TRUE":"FALSE") + ")";
            },

            log: function(command) {
                command = "rcloud.support::session.log(\"" + rcloud.username() + "\", \"" +
                    command.replace(/\\/g,"\\\\").replace(/"/g,"\\\"")
                + "\")";
                this.send(command);
            },

            record_cell_execution: function(cell_model) {
                var json_rep = JSON.stringify(cell_model.json());
                var call = this.r_funcall("rcloud.record.cell.execution", 
                                          rcloud.username(), json_rep);
                rserve.eval(call);
            },

            send: function(command, wrap) {
                this.send_and_callback(command, no_callback, wrap);
            },

            send_and_callback: function(command, callback, wrap) {
                var that = this;
                if (_.isUndefined(callback))
                    callback = no_callback;
                var t;
                if (wrap) {
                    command = wrap(command);
                } else {
                    command = this.wrap_command(command, true);
                }
                if (_debug)
                    console.log(command);
                function unwrap(v) {
                    v = v.value.json();
                    if (_debug) {
                        debugger;
                        console.log(v);
                    }
                    try {
                        callback(v[1]);
                    } catch (e) {
                        if (e.constructor === NoCallbackError) {
                            that.handlers[v[0]](v[1]);
                        } else
                            throw e;
                    }
                }
                rserve.eval(command, unwrap);
            },

            // supports only the following argument types:
            // * string
            // * number
            // * array of string/number (doesn't check they match)
            r_funcall: function(function_name) {
                function output_one(result, val) {
                    var t = typeof val;
                    if (t === "string") {
                        result.push(escape_r_literal_string(val));
                    } 
                    else if (t == "number") {
                        result.push(String(val));
                    }
                    else throw "unsupported r_funcall argument type " + t;
                }
                var result = [function_name, "("];
                for (var i=1; i<arguments.length; ++i) {
                    var arg = arguments[i];
                    if ($.isArray(arg)) {
                        result.push("c(");
                        for(var j = 0; j<arg.length; ++j) {
                            output_one(result,arg[j]);
                            if(j < arg.length-1)
                                result.push(",");
                        }
                        result.push(")");
                    }
                    else output_one(result, arg);
                    if (i < arguments.length-1)
                        result.push(",");
                }
                result.push(")");
                var s = result.join("");
                return s;
            }
        };
        return result;
    }
};

})();
rcloud = {};

rcloud.init_client_side_data = function()
{
    var that = this;
    rclient.send_and_callback("rcloud.prefix.uuid()", function(data) {
        that.wplot_uuid = data;
    });
};

rcloud.username = function()
{
    return $.cookies.get('user');
};

rcloud.github_token = function()
{
    return $.cookies.get('token');
};

rcloud.search = function(search_string, k)
{
    var that = this;
    if (_.isUndefined(k)) k = _.identity;
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.search", search_string), k);
};

rcloud.load_user_config = function(user, k)
{
    if (_.isUndefined(k)) k = _.identity;
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.load.user.config", user), function(result) {
            k && k(JSON.parse(result));
        });
}

rcloud.load_multiple_user_configs = function(users, k)
{
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.load.multiple.user.configs", users), function(result) {
            k && k(JSON.parse(result));
        });
}


rcloud.save_user_config = function(user, content, k)
{
    if (_.isUndefined(k)) k = _.identity;
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.save.user.config", user, 
                          JSON.stringify(content)), 
        function(result) {
            k && k(JSON.parse(result));
        });
}

rcloud.load_notebook = function(id, k)
{
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.get.notebook", id), 
        function(result) {
            k && k(JSON.parse(result));
        });
}

rcloud.update_notebook = function(id, content, k)
{
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.update.notebook", id, JSON.stringify(content)), 
        function(result) {
            k && k(JSON.parse(result));
        });
}

rcloud.create_notebook = function(content, k)
{
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.create.notebook", JSON.stringify(content)), 
        function(result) {
            k && k(JSON.parse(result));
        });
}

rcloud.resolve_deferred_result = function(uuid, k)
{
    var cmd = rclient.r_funcall("rcloud.fetch.deferred.result", uuid);
    rclient.send_and_callback(cmd, k);
};

rcloud.get_users = function(k)
{
    rclient.send_and_callback(
        rclient.r_funcall("rcloud.get.users"),
        function(result) {
            k && k(result); // why is this coming back preparsed? JSON.parse(result));
        });
}
Notebook = {};

//////////////////////////////////////////////////////////////////////////////
//
// roughly a MVC-kinda-thing per cell, plus a MVC for all the cells
// 
Notebook.Cell = {};
(function() {

function fa_button(which, title)
{
    return $("<span class='fontawesome-button'><i class='" + 
             which + 
             "'></i></span>").tooltip({ 
                 title: title, 
                 delay: { show: 250, hide: 0 }
             });
}

function create_markdown_cell_html_view(cell_model)
{
    var notebook_cell_div  = $("<div class='notebook-cell'></div>");

    //////////////////////////////////////////////////////////////////////////
    // button bar
    var source_button = fa_button("icon-edit", "source");
    var result_button = fa_button("icon-picture", "result");
    var hide_button   = fa_button("icon-resize-small", "hide");
    var remove_button = fa_button("icon-trash", "remove");
    var run_md_button = fa_button("icon-repeat", "run");

    function update_model() {
        return cell_model.content(widget.getSession().getValue());
    }
    function enable(el) {
        el.removeClass("button-disabled");
    }
    function disable(el) {
        el.addClass("button-disabled");
    }

    source_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled")) {
            result.show_source();
        }
    });
    result_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled"))
            result.show_result();
    });
    hide_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled"))
            result.hide_all();
    });
    remove_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled")) {
            cell_model.parent_model.controller.remove_cell(cell_model);

            // twitter bootstrap gets confused about its tooltips if parent element 
            // is deleted while tooltip is active; let's help it
            $(".tooltip").remove();
        }
    });
    function execute_cell() {
        r_result_div.html("Computing...");
        var new_content = update_model();
        result.show_result();
        if(new_content)
            cell_model.parent_model.controller.update_cell(cell_model);
        cell_model.controller.execute();
    }
    run_md_button.click(function(e) {
        execute_cell();
    });

    // Ace sets its z-index to be 1000; 
    // "and thus began the great z-index arms race of 2012"
    var button_float = $("<div style='position:relative; float: right; z-index:10000'></div>");
    var row1 = $("<div style='margin:0.5em;'></div>");
    var editor_row = $("<div style='margin:0.5em;'></div>");
    row1.append(source_button);
    row1.append(result_button);
    row1.append(hide_button);
    row1.append(remove_button);
    button_float.append(row1);
    editor_row.append(run_md_button);
    editor_row.hide();
    button_float.append(editor_row);

    notebook_cell_div.append(button_float);

    //////////////////////////////////////////////////////////////////////////

    var inner_div = $("<div></div>");
    var clear_div = $("<div style='clear:both;'></div>");
    notebook_cell_div.append(inner_div);
    notebook_cell_div.append(clear_div);

    var markdown_div = $('<div style="position: relative; width:100%; height:100%"></div>');
    var cell_buttons_div = $('<div style="position: absolute; right:-0.5em; top:-0.5em"></div>');
    var insert_cell_button = fa_button("icon-plus-sign", "insert cell");
    inner_div.append(cell_buttons_div);
    cell_buttons_div.append(insert_cell_button);
    insert_cell_button.click(function(e) {
        shell.insert_markdown_cell_before(cell_model.id);
    });
    
    var ace_div = $('<div style="width:100%; height:100%"></div>');
    inner_div.append(markdown_div);
    markdown_div.append(ace_div);
    var widget = ace.edit(ace_div[0]);
    var RMode = require("mode/rmarkdown").Mode;
    var session = widget.getSession();
    var doc = session.doc;
    widget.getSession().setMode(new RMode(false, doc, session));

    widget.setTheme("ace/theme/chrome");
    widget.getSession().setUseWrapMode(true);
    widget.resize();

    widget.commands.addCommand({
        name: 'sendToR',
        bindKey: {
            win: 'Ctrl-Return',
            mac: 'Command-Return',
            sender: 'editor'
        },
        exec: function(widget, args, request) {
            execute_cell();
        }
    });

    var r_result_div = $('<div class="r-result-div"><span style="opacity:0.5">Computing ...</span></div>');
    inner_div.append(r_result_div);

    // FIXME this is a terrible hack created simply so we can scroll
    // to the end of a div. I know no better way of doing this..
    var end_of_div_span = $('<span></span>');
    inner_div.append(end_of_div_span);

    var current_mode;

    var result = {

        //////////////////////////////////////////////////////////////////////
        // pubsub event handlers

        content_updated: function() {
            return widget.getSession().setValue(cell_model.content());
        },
        self_removed: function() {
            notebook_cell_div.remove();
        },
        result_updated: function(r) {
            r_result_div.hide();
            r_result_div.html(r);
            r_result_div.slideDown(150);

            // There's a list of things that we need to do to the output:
            var uuid = rcloud.wplot_uuid;

            // capture interactive graphics
            inner_div.find("pre code")
                .contents()
                .filter(function() {
                    return this.nodeValue.indexOf(uuid) !== -1;
                }).parent().parent()
                .each(function() {
                    var uuids = this.childNodes[0].childNodes[0].data.substr(8,73).split("|");
                    var that = this;
                    rcloud.resolve_deferred_result(uuids[1], function(data) {
                        $(that).replaceWith(function() {
                            return shell.handle(data[0], data);
                        });
                    });
                });
            // highlight R
            inner_div
                .find("pre code")
                .each(function(i, e) {
                    hljs.highlightBlock(e);
                });
            
            // typeset the math
            if (!_.isUndefined(MathJax))
                MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
                
            this.show_result();
            end_of_div_span[0].scrollIntoView();
        },

        //////////////////////////////////////////////////////////////////////

        hide_buttons: function() {
            button_float.css("display", "none");
            cell_buttons_div.css("display", "none");
        },
        show_buttons: function() {
            button_float.css("display", null);
            cell_buttons_div.css("display", null);
        },

        show_source: function() {
            notebook_cell_div.css({'height': '70%'});
            disable(source_button);
            enable(result_button);
            enable(hide_button);
            enable(remove_button);
            editor_row.show();

            markdown_div.show();
            r_result_div.hide();
            widget.resize();
            widget.focus();

            current_mode = "source";
        },
        show_result: function() {
            notebook_cell_div.css({'height': ''});
            enable(source_button);
            disable(result_button);
            enable(hide_button);
            enable(remove_button);

            editor_row.hide();
            markdown_div.hide();
            r_result_div.slideDown(150, function() {
                end_of_div_span[0].scrollIntoView();
            }); // show();
            current_mode = "result";
        },
        hide_all: function() {
            notebook_cell_div.css({'height': ''});
            enable(source_button);
            enable(result_button);
            disable(hide_button);
            enable(remove_button);

            editor_row.hide();
            if (current_mode === "result") {
                r_result_div.slideUp(150); // hide();
            } else {
                markdown_div.slideUp(150); // hide();
            }
        },
        /*
        // this doesn't make sense: changes should go through controller
        remove_self: function() {
            cell_model.parent_model.remove_cell(cell_model);            
            notebook_cell_div.remove();
        },
        */
        div: function() {
            return notebook_cell_div;
        },
        update_model: function() {
            return update_model();
        },
        focus: function() {
            widget.focus();
        },
        get_content: function() { // for debug
            return cell_model.content();
        }
    };

    result.show_result();
    result.content_updated();
    return result;
};

function create_interactive_cell_html_view(cell_model)
{
    var notebook_cell_div  = $("<div class='notebook-cell'></div>");

    //////////////////////////////////////////////////////////////////////////
    // button bar
    var source_button = $("<span class='fontawesome-button'><i class='icon-edit'></i></span>").tooltip({ title: "source" });
    var result_button = $("<span class='fontawesome-button'><i class='icon-picture'></i></span>").tooltip({ title: "result" });
    var hide_button   = $("<span class='fontawesome-button'><i class='icon-resize-small'></i></span>").tooltip({ title: "hide" });
    var remove_button = $("<span class='fontawesome-button'><i class='icon-trash'></i></span>").tooltip({ title: "remove" });

    function update_model() {
        return cell_model.content($(input).val());
    }
    function enable(el) {
        el.removeClass("button-disabled");
    }
    function disable(el) {
        el.addClass("button-disabled");
    }

    source_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled")) {
            result.show_source();
        }
    });
    result_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled"))
            result.show_result();
    });
    hide_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled"))
            result.hide_all();
    });
    remove_button.click(function(e) {
        if (!$(e.currentTarget).hasClass("button-disabled")) {
            cell_model.parent_model.controller.remove_cell(cell_model);

            // twitter bootstrap gets confused about its tooltips if parent element 
            // is deleted while tooltip is active; let's help it
            $(".tooltip").remove();
        }
    });
    function execute_cell() {
        r_result_div.html("Computing...");
        var new_content = update_model();
        result.show_result();
        if(new_content)
            cell_model.parent_model.controller.update_cell(cell_model);
        cell_model.controller.execute();
    }

    // Ace sets its z-index to be 1000; 
    // "and thus began the great z-index arms race of 2012"
    var button_float = $("<div style='position:relative; float: right; z-index:10000'></div>");
    var row1 = $("<div style='margin:0.5em;'></div>");
    var editor_row = $("<div style='margin:0.5em;'></div>");
    row1.append(source_button);
    row1.append(result_button);
    row1.append(hide_button);
    row1.append(remove_button);
    button_float.append(row1);
    editor_row.hide();
    button_float.append(editor_row);

    notebook_cell_div.append(button_float);

    //////////////////////////////////////////////////////////////////////////

    var inner_div = $("<div></div>");
    var clear_div = $("<div style='clear:both;'></div>");
    notebook_cell_div.append(inner_div);
    notebook_cell_div.append(clear_div);

    var markdown_div = $('<div style="position: relative; width:100%;"></div>');
    var cell_buttons_div = $('<div style="position: absolute; right:-0.5em; top:-0.5em"></div>');
    var insert_cell_button = fa_button("icon-plus-sign", "insert cell");
    inner_div.append(cell_buttons_div);
    cell_buttons_div.append(insert_cell_button);
    insert_cell_button.click(function(e) {
        shell.insert_markdown_cell_before(cell_model.id);
    });
    
    var ace_div = $('<div style="width:100%; margin-left: 0.5em; margin-top: 0.5em"></div>');
    inner_div.append(markdown_div);
    markdown_div.append(ace_div);

    var input = $('<input type="text" style="width:88%"/>');
    ace_div.append(input);
    // http://stackoverflow.com/questions/699065
    input.keypress(function(e) {
        if (e.which === 13) {
            execute_cell();
            e.preventDefault();
            return false;
        }
        return true;
    });

    var r_result_div = $('<div class="r-result-div"></div>');
    inner_div.append(r_result_div);
    var end_of_div_span = $('<span></span>');
    inner_div.append(end_of_div_span);
    var current_mode;

    var result = {

        //////////////////////////////////////////////////////////////////////
        // pubsub event handlers

        content_updated: function() {
            input.val(cell_model.content());
        },
        self_removed: function() {
            notebook_cell_div.remove();
        },
        result_updated: function(r) {
            r_result_div.hide();
            r_result_div.html(r);
            r_result_div.slideDown(150);

            // There's a list of things that we need to do to the output:
            var uuid = rcloud.wplot_uuid;

            // capture interactive graphics
            inner_div.find("pre code")
                .contents()
                .filter(function() {
                    return this.nodeValue.indexOf(uuid) !== -1;
                }).parent().parent()
                .each(function() {
                    var uuids = this.childNodes[0].childNodes[0].data.substr(8,73).split("|");
                    var that = this;
                    rcloud.resolve_deferred_result(uuids[1], function(data) {
                        $(that).replaceWith(function() {
                            return shell.handle(data[0], data);
                        });
                    });
                });
            // highlight R
            inner_div
                .find("pre code")
                .each(function(i, e) {
                    hljs.highlightBlock(e);
                });
            
            // typeset the math
            if (!_.isUndefined(MathJax))
                MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
                
            this.show_result();
            end_of_div_span[0].scrollIntoView();
        },

        //////////////////////////////////////////////////////////////////////

        hide_buttons: function() {
            button_float.css("display", "none");
            cell_buttons_div.css("display", "none");
        },
        show_buttons: function() {
            button_float.css("display", null);
            cell_buttons_div.css("display", null);
        },

        show_source: function() {
            notebook_cell_div.css({'height': ''});
            disable(source_button);
            enable(result_button);
            enable(hide_button);
            enable(remove_button);
            editor_row.show();

            markdown_div.show();
            r_result_div.hide();
            input.focus();

            current_mode = "source";
        },
        show_result: function() {
            notebook_cell_div.css({'height': ''});
            enable(source_button);
            disable(result_button);
            enable(hide_button);
            enable(remove_button);

            editor_row.hide();
            markdown_div.hide();
            r_result_div.slideDown(150, function() {
                end_of_div_span[0].scrollIntoView();
            });
            current_mode = "result";
        },
        hide_all: function() {
            notebook_cell_div.css({'height': ''});
            enable(source_button);
            enable(result_button);
            disable(hide_button);
            enable(remove_button);

            editor_row.hide();
            if (current_mode === "result") {
                r_result_div.slideUp(150); // hide();
            } else {
                markdown_div.slideUp(150); // hide();
            }
        },
        /*
        // this doesn't make sense: changes should go through controller
        remove_self: function() {
            cell_model.parent_model.remove_cell(cell_model);            
            notebook_cell_div.remove();
        },
        */
        div: function() {
            return notebook_cell_div;
        },
        update_model: function() {
            return update_model();
        },
        focus: function() {
            input.focus();
        },
        get_content: function() { // for debug
            return cell_model.content();
        }
    };

    result.show_result();
    result.content_updated();
    return result;
}

var dispatch = {
    Markdown: create_markdown_cell_html_view,
    R: create_markdown_cell_html_view
};

Notebook.Cell.create_html_view = function(cell_model)
{
    return dispatch[cell_model.language()](cell_model);
};

})();
Notebook.Cell.create_model = function(content, language)
{
    var result = {
        views: [], // sub list for pubsub
        id: -1,
        language: function() {
            return language;
        },
        content: function(new_content) {
            if (!_.isUndefined(new_content)) {
                if(content != new_content) {
                    content = new_content;
                    notify_views();
                    return content;
                }
                else return null;
            }
            return content;
        },
        json: function() {
            return {
                content: content,
                language: language
            };
        }
    };
    function notify_views() {
        _.each(result.views, function(view) {
            view.content_updated();
        });
    }
    return result;
};
Notebook.Cell.create_controller = function(cell_model)
{
    var result = {
        execute: function() {
            var that = this;
            var language = cell_model.language();
            function callback(r) {
                _.each(cell_model.views, function(view) {
                    view.result_updated(r);
                });
            }
            
            rclient.record_cell_execution(cell_model);

            if (language === 'Markdown') {
                var wrapped_command = rclient.markdown_wrap_command(cell_model.content());
                rclient.send_and_callback(wrapped_command, callback, _.identity);
            } else if (language === 'R') {
                var wrapped_command = rclient.markdown_wrap_command("```{r}\n" + cell_model.content() + "\n```\n");
                rclient.send_and_callback(wrapped_command, callback, _.identity);
            } else alert("Don't know language '" + language + "' - can only do Markdown or R for now!");
        }
    };

    return result;
};
Notebook.create_html_view = function(model, root_div)
{
    var result = {
        model: model,
        sub_views: [],
        cell_appended: function(cell_model) {
            var cell_view = Notebook.Cell.create_html_view(cell_model);
            cell_model.views.push(cell_view);
            root_div.append(cell_view.div());
            this.sub_views.push(cell_view);
            return cell_view;
        },
        cell_inserted: function(cell_model, cell_index) {
            var cell_view = Notebook.Cell.create_html_view(cell_model);
            cell_model.views.push(cell_view);
            root_div.append(cell_view.div());
            $(cell_view.div()).insertBefore(root_div.children('.notebook-cell')[cell_index]);
            this.sub_views.splice(cell_index, 0, cell_view);
            cell_view.show_source();
            return cell_view;
        },
        cell_removed: function(cell_model, cell_index) {
            _.each(cell_model.views, function(view) {
                view.self_removed();
            });
            this.sub_views.splice(cell_index, 1);
        },
        
        update_model: function() {
            return _.map(this.sub_views, function(cell_view) {
                return cell_view.update_model();
            });
        }
    };
    model.views.push(result);
    return result;
};
Notebook.create_model = function()
{
    /* note, the code below is a little more sophisticated than it needs to be:
       allows multiple inserts or removes but currently n is hardcoded as 1.  */

    function last_id(notebook) {
        if(notebook.length)
            return notebook[notebook.length-1].id;
        else
            return 0;
    }
    return { 
        notebook: [],
        views: [], // sub list for pubsub
        clear: function() {
            return this.remove_cell(null,last_id(this.notebook));
        },
        append_cell: function(cell_model, id) {
            cell_model.parent_model = this;
            var changes = [];
            var n = 1;
            id = id || 1;
            id = Math.max(id, last_id(this.notebook)+1);
            while(n) {
                changes.push([id,{content: cell_model.content(), language: cell_model.language()}]);
                cell_model.id = id;
                this.notebook.push(cell_model);
                _.each(this.views, function(view) {
                    view.cell_appended(cell_model);
                });
                ++id;
                --n;
            }
            return changes;
        },
        insert_cell: function(cell_model, id) {
            var that = this;
            cell_model.parent_model = this;
            var changes = [];
            var n = 1, x = 0;
            while(x<this.notebook.length && this.notebook[x].id < id) ++x;
            // check if ids can go above rather than shifting everything else down
            if(x<this.notebook.length && id+n > this.notebook[x].id) {
                var prev = x>0 ? this.notebook[x-1].id : 0;
                id = Math.max(this.notebook[x].id-n, prev+1);
            }
            for(var j=0; j<n; ++j) {
                changes.push([id+j, {content: cell_model.content(), language: cell_model.language()}]);
                cell_model.id = id+j;
                this.notebook.splice(x, 0, cell_model);
                _.each(this.views, function(view) {
                    view.cell_inserted(that.notebook[x], x);
                });
                ++x;
            }
            while(x<this.notebook.length && n) {
                if(this.notebook[x].id > id) {
                    var gap = this.notebook[x].id - id;
                    n -= gap;
                    id += gap;
                }
                if(n<=0)
                    break;
                changes.push([this.notebook[x].id,{content: this.notebook[x].content(),
                                                   rename: this.notebook[x].id+n,
                                                   language: this.notebook[x].language()}]);
                this.notebook[x].id += n;
                ++x;
                ++id;
            }
            return changes;
        },
        remove_cell: function(cell_model, n) {
            var that = this;
            var cell_index, id;
            if(cell_model!=null) {
                cell_index = this.notebook.indexOf(cell_model);
                id = cell_model.id;
                if (cell_index === -1) {
                    throw "cell_model not in notebook model?!";
                }
            }
            else {
                cell_index = 0;
                id = 1;
            }
            var n = n || 1, x = cell_index;
            var changes = [];
            while(x<this.notebook.length && n) {
                if(this.notebook[x].id == id) {
                    _.each(this.views, function(view) {
                        view.cell_removed(that.notebook[x], x);
                    });
                    changes.push([id, {erase: 1, language: that.notebook[x].language()} ])
                    this.notebook.splice(x, 1);
                }
                ++id;
                --n;
            }
            return changes;
        },
        update_cell: function(cell_model) {
            return [[cell_model.id, {content: cell_model.content(), 
                                     language: cell_model.language()}]];
        },
        reread_cells: function() {
            var that = this;
            var changed_cells_per_view = _.map(this.views, function(view) {
                return view.update_model();
            });
            if(changed_cells_per_view.length != 1)
                throw "not expecting more than one notebook view";
            return _.reduce(changed_cells_per_view[0], 
                            function(changes, content, index) { 
                                if(content)
                                    changes.push([that.notebook[index].id, {content: content,
                                                                            language: that.notebook[index].language()}]);
                                return changes;
                            },
                            []);
        },
        json: function() {
            return _.map(this.notebook, function(cell_model) {
                return cell_model.json();
            });
        }
    };
};
Notebook.create_controller = function(model)
{
    function append_cell_helper(content, type, id) {
        var cell_model = Notebook.Cell.create_model(content, type);
        var cell_controller = Notebook.Cell.create_controller(cell_model);
        cell_model.controller = cell_controller;
        return [cell_controller, model.append_cell(cell_model, id)];
    }

    function insert_cell_helper(content, type, id) {
        var cell_model = Notebook.Cell.create_model(content, type);
        var cell_controller = Notebook.Cell.create_controller(cell_model);
        cell_model.controller = cell_controller;
        return [cell_controller, model.insert_cell(cell_model, id)]
    }

    var result = {
        append_cell: function(content, type, id) {
            var cch = append_cell_helper(content, type, id);
            this.update_notebook(cch[1]);
            return cch[0];
        },
        insert_cell: function(content, type, id) {
            var cch = insert_cell_helper(content, type, id);
            this.update_notebook(cch[1]);
            return cch[0];
        },
        remove_cell: function(cell_model) {
            var changes = model.remove_cell(cell_model);
            this.update_notebook(changes);
        },
        clear: function() {
            model.clear();
        },
        load_notebook: function(gistname, k) {
            var that = this;
            rcloud.load_notebook(gistname, function(notebook) {
                that.clear();
                var parts = {}; // could rely on alphabetic input instead of gathering
                _.each(notebook.files, function (file) {
                    var filename = file.filename;
                    if(/^part/.test(filename)) {
                        var number = parseInt(filename.slice(4).split('.')[0]);
                        if(number !== NaN)
                            parts[number] = [file.content, file.language, number];
                    }
                    // style..
                });
                for(var i in parts)
                    append_cell_helper(parts[i][0], parts[i][1], parts[i][2]);
                k && k(notebook);
            });
        },
        create_notebook: function(content, k) {
            var that = this;
            rcloud.create_notebook(content, function(notebook) {
                that.clear();
                k && k(notebook);
            });
        },
        update_notebook: function(changes) {
            if(!changes.length)
                return;
            function partname(id, language) {
                var ext;
                switch(language) {
                case 'R': 
                    ext = 'R';
                    break;
                case 'Markdown':
                    ext = 'md';
                    break;
                default:
                    throw "Unknown language " + language;
                }
                return 'part' + id + '.' + ext;
            }
            function changes_to_gist(changes) {
                // we don't use the gist rename feature because it doesn't
                // allow renaming x -> y and creating a new x at the same time
                // instead, create y and if there is no longer any x, erase it
                var post_names = _.reduce(changes, 
                                         function(names, change) {
                                             if(!change[1].erase) {
                                                 var after = change[1].rename || change[0];
                                                 names[partname(after, change[1].language)] = 1;
                                             }
                                             return names;
                                         }, {});
                function xlate_change(filehash, change) {
                    var c = {};
                    if(change[1].content !== undefined)
                        c.content = change[1].content;
                    var pre_name = partname(change[0], change[1].language);
                    if(change[1].erase || !post_names[pre_name])
                        filehash[pre_name] = null;
                    var post_name = partname(change[1].rename || change[0], change[1].language);
                    if(!change[1].erase)
                        filehash[post_name] = c;
                    return filehash;
                }
                return {files: _.reduce(changes, xlate_change, {})};
            }
            rcloud.update_notebook(shell.gistname, changes_to_gist(changes), _.bind(editor.notebook_loaded, editor));
        },
        refresh_cells: function() {
            return model.reread_cells();
        },
        update_cell: function(cell_model) {
            this.update_notebook(model.update_cell(cell_model));
        },
        run_all: function() {
            var changes = this.refresh_cells();
            this.update_notebook(changes);
            _.each(model.notebook, function(cell_model) {
                cell_model.controller.execute();
            });
        }
    };
    model.controller = result;
    return result;
};
