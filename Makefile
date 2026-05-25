# Get the base names of all .svg files in preset_outlines/
SVG_FILES := $(wildcard preset_outlines/*.svg)
TARGETS := $(patsubst preset_outlines/%.svg,%,$(SVG_FILES))

.PHONY: $(TARGETS) all configurator

define RUN_SNAKESKIN
	python src/snakeskin.py preset_outlines/$@.svg --config preset_configs/$@.json
endef

all_presets: $(TARGETS)

$(TARGETS):
	$(RUN_SNAKESKIN)

# Serve the visual config UI at http://localhost:8771/configurator/
configurator:
	@echo "Open http://localhost:8771/configurator/ in your browser. Ctrl-C to stop."
	@python -m http.server 8771
