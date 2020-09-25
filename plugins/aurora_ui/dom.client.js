goog.provide('ui.dom');

/**
 * clean up error tags on page
 */
ui.dom.tidyErroredTags = function() {

    // Adjust tags so they don't overlap each other
    let containers = document.getElementsByClassName('errored_tag_container');
    for (let i = 0; i < containers.length; i++) {
        var target = containers[i];
        var bounds = goog.style.getBounds(target);
        let right = bounds.left + bounds.width;
        let bottom = bounds.top + bounds.height;

        var max_overlap = 0;
        for (let j = 0; j < containers.length; j++) {
            if (j !== i) {
                var other = containers[j];
                var pos = goog.style.getBounds(other);
                var height = pos.height;

                if (pos.left >= bounds.left && pos.left <= right
                    && (pos.top >= bounds.top && pos.top <= bottom)
                    || (pos.top + height >= bounds.top && pos.top + height <= bottom)) {

                    // Overlap found, see if largest
                    var overlap = (right - pos.left);
                    if (overlap > max_overlap) {
                        max_overlap = overlap;
                    }
                }
            }

        }

        // Adjust width of target tag so it doesn't overlap
        if (max_overlap > 0) {
            goog.style.setStyle(target, {
                'max-width': (bounds.width - (max_overlap + 10)) + 'px'
            });
        }
    }
};
