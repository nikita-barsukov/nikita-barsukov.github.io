define(["helpers", "line_chart", "d3", "backbone", "topojson", "jquery", "jqueryui"], function(helpers, LineChart, d3){

    var BaseChart = Backbone.View.extend({
        defaults: {
            width: 900,
            height: 600,
            buckets: 8,
            domain: [150000,550000],
            legend_format: d3.format(",", Math.ceil),
            tooltip_format: d3.format(",", Math.ceil),
            x_var: "muni",
            prefix: "y-",
            template_string: "Average net household income in <%= year %>, DKK",
            sparkline: true
        },

        events: {
            "click .controls": "playback"
        },

        initialize: function(options) {
            this.options = _.extend({}, this.defaults, options);
        },

        render: function(){
            this.svg = d3.select(this.el).append("svg")
              .attr("width", this.options['width'])
              .attr("height", this.options['height'])
              
            this.chart = this.svg.append("g")
              .attr("class", "chart-container");

            chart = this.chart;

            if(this.options.enhance) {
                var zoom = d3.behavior.zoom()
                    .scaleExtent([1, 5])
                    .on("zoom", function() {
                          chart.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
                        });
                this.svg.call(zoom);
            }
            return this;
        },

        render_map: function(m) {
            var chart = this;
                
            var projection = d3.geo.albers()
                  .center([16, 56.2])
                  .rotate([4.4, 0])
                  .parallels([54, 57])
                  .scale(11000)
                  .translate([chart.options['width'] / 2, chart.options['height'] / 2]);

            var path = d3.geo.path()
                .projection(projection);

            chart.chart.selectAll(".kommune")
                .data(topojson.feature(m, m["objects"]['kommuner2M']).features)
                .enter().append("path")
                  .attr("d", path)
                  .attr("class", function(d){
                    return d["properties"]["KOMNAVN"]
                  })
        },
        // dataset: array of datapoints
        render_cholopleth: function(data, y_var) {
            var chart = this;
            var tooltip = $("#tooltip")
            var sc = helpers.color_scale_function(chart.options.domain, chart.options.palette, chart.options.buckets);

            var dataset = _.map(data, function(e){
                var p = {kommune: e[chart.options.x_var]};
                if(chart.options.y_label){
                    p[chart.options.y_label] = e[y_var]    
                } else {
                    p[y_var] = e[y_var]
                }
                
                return p
            });

            dataset.forEach(function(d){
                var col;
                if(chart.options.y_label){
                    col = sc(d[chart.options.y_label]);   
                } else {
                    col = sc(d[y_var]);
                }                
                chart.chart.selectAll("." + d["kommune"]).transition().duration(1000).attr("fill", col);
            });

            if(chart.options.tooltip) {
                chart.chart.selectAll("path").on("mouseover", function(d){
                    var komnavn = this.classList[0];
                    var raw_komdata = _.findWhere(data, {muni: komnavn});
                    var base_data = _.findWhere(data, {muni: "Danmark"});

                    p = _.find(dataset, function(d){return d["kommune"] == komnavn});
                    tooltip.css("display", "block");
                    tooltip.append(helpers.generate_tooltip_html(p, chart.options.tooltip_format));
                    tooltip.css("top", (d3.event.pageY - 20)+"px")
                      .css("left",(d3.event.pageX + 10)+"px");

                    d3.selectAll("." + komnavn).classed("highlighted", true);
                    d3.selectAll("." + komnavn).moveToFront();

                    if(chart.options.sparkline){
                        var komdata = []                    

                        for (var key in raw_komdata) {
                            if (raw_komdata.hasOwnProperty(key) && key !== chart.options.x_var) {
                                
                                var elem = {};

                                elem["x"] = key.replace(chart.options['prefix'], "") 
                                elem["y"] = raw_komdata[key]
                                elem["base"] = base_data[key]
                                komdata.push(elem)
                            }
                        }                    
                        
                        var spark = new LineChart({
                            el: "#tooltip",
                            y_domain: chart.options['domain'],
                            margin: chart.options['tooltip_margins'],
                        });
                        spark.render(komdata);
                        spark.render_year_line(chart.sl.slider("option", "value"))
                    }

                }).on("mousemove", function(d){
                     tooltip.css("top", (d3.event.pageY)+"px")
                      .css("left",(d3.event.pageX + 10)+"px")
                })
                .on("mouseout", function(d){
                    tooltip.css("display", "none");
                    tooltip.empty();
                    d3.selectAll(".highlighted").classed("highlighted", false);
                });                
            }
        },  
        render_legend: function(){
            var chart = this;
            var legend_breaks = helpers.color_scale_function(chart.options.domain, 
                                                             chart.options.palette, 
                                                             chart.options.buckets).quantiles(); 

            this.legend = chart.svg.append("g")
                .attr("class", "legend");

            // adding background color to legend
            this.legend.append("rect")
                .attr("class", "legend-background")
                .attr("x", 0)
                .attr("y", 40)
                .attr("rx", 10)
                .attr("ry", 10)
                .attr("width", 120)
                .attr("height", 45 + 22 * (d3.range(chart.options.buckets).length - 1));

            this.legend.selectAll(".legend-block")
                .data(d3.range(chart.options.buckets))
                .enter().append("rect")
                    .attr("width", 40)
                    .attr("height", 20)
                    .attr("y", function(d, i){ return 45 + i*23;})
                    .attr("x", 10)
                    .attr("fill", function(d,i){return colorbrewer[chart.options.palette][chart.options.buckets][i]})
                    .attr("class", "legend-block");

            this.legend.selectAll("text")
                .data(legend_breaks)
            .enter().append("text")
                .attr("text-anchor", "start") // text-align
                .attr("x", 50)
                .attr("y", function(d, i){return 57 + i*23})
                .attr("dx", 8) // padding-right
                .attr("dy", 15) // vertical-align: used font size (copied from css. must be a better way)
                .attr("class", "legend")
                .text(function (d){return chart.options.legend_format(d)} );

        },
        render_slider: function(dataset){
            var chart = this;
            chart.$el.prepend(
                "<div class='slider-controls'> \
                    <div class='controls btn btn-default'><span class='glyphicon glyphicon-play'></span></div> \
                    <div class='slider'></div> \
                </div>");
            chart.$el.prepend("<h2 class='year-label'></h2>");
            chart.$el.find(".year-label").text(_.template(chart.options['template_string'], {year: "2000"}))
            chart.sl = chart.$el.find(".slider").slider({
                orientation: "horizontal",
                min: 2000,
                max: 2012,
                value: 2000,
                slide: function( event, ui ) {
                    chart.$el.find(".year-label").text(_.template(chart.options['template_string'], {year: ui.value}))                    
                    chart.render_cholopleth(dataset, chart.options['prefix'] + ui.value)
                },
                change: function( event, ui ) {
                    chart.$el.find(".year-label").text(_.template(chart.options['template_string'], {year: ui.value}))
                    chart.render_cholopleth(dataset, chart.options['prefix'] + ui.value)
                }
            });
        },
        playback: function(e) {
            var chart = this;

            var year = 2000;
            chart.sl.slider("value", year);
            var i = setInterval(function(){
                chart.sl.slider("value", year)

                year++;
                if(year === 2013) {
                    clearInterval(i);
                }
            }, 1000);
                   
        }
    });
    return BaseChart;  
})
