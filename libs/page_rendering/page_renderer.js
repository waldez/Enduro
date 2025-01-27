// * ———————————————————————————————————————————————————————— * //
// * 	enduro render
// *	renders individual page based on source template, context and culture
// * ———————————————————————————————————————————————————————— * //
const page_renderer = function () {}

// * vendor dependencies
const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs-extra'))
const extend = require('extend')
const path = require('path')

// * enduro dependencies
const flat_helpers = require(enduro.enduro_path + '/libs/flat_db/flat_helpers')
const logger = require(enduro.enduro_path + '/libs/logger')
const flat = require(enduro.enduro_path + '/libs/flat_db/flat')
const babel = require(enduro.enduro_path + '/libs/babel/babel')
const globalizer = require(enduro.enduro_path + '/libs/globalizer/globalizer')
const markdownifier = require(enduro.enduro_path + '/libs/markdown/markdownifier')

// * ———————————————————————————————————————————————————————— * //
// * 	renders individual template with provided context, culture and destination path
// * 	saves the file afterwards
// *	@param {string} template_path - context - path to .hbs template file. absolute path
// *	@param {string} context_path - context - path to context file, relative to /cms filder
// *	@param {string} culture - context - culture name. destination path gets prefixed by culture
// *	@param {string} dest_path - path to where the rendered .html file should be saved, relative to /build folder.
// *	@return {promise} -  empty payload
// * ———————————————————————————————————————————————————————— * //
page_renderer.prototype.render_file = function (template_path, context_path, culture, dest_path) {
	const self = this

	return new Promise(function (resolve, reject) {

		// where will the generated page be saved
		const destination_path = path.join(culture, dest_path)

		flat.load(context_path)
			.then((context) => {
				extend(true, context, { _meta: { context_path: context_path } })
				return self.render_file_by_context(template_path, context, culture)
			}, () => {
				logger.err('something went wrong attempting to locate template_path: ' + template_path)
				throw new Error('abort promise chain')
			})
			.then((output) => {
				// Makes sure the target directory exists
				flat_helpers.ensure_directory_existence(path.join(enduro.project_path, enduro.config.build_folder, destination_path))
					.then(function () {
						// Attempts to export the template_path
						fs.writeFile(path.join(enduro.project_path, enduro.config.build_folder, destination_path + '.html'), output, function (err) {
							if (err) { return logger.err_block(err) }

							logger.twolog('page ' + destination_path, 'created', 'enduro_render_events')
							resolve()
						})
					})
			})
	})
}

// * ———————————————————————————————————————————————————————— * //
// * 	renders individual template with provided context and culture
// *	@param {string} template_path - context - path to .hbs template file. absolute path
// *	@param {object} context - context - path to context file, relative to /cms filder
// *	@param {string} culture - context - culture name
// *	@return {promise} -  promise with the rendered file as payload
// * ———————————————————————————————————————————————————————— * //
page_renderer.prototype.render_file_by_context = function (template_path, context, culture) {

	// extracts the relative path to the template from the absolute path
	const file_regex_match = template_path.match(/pages(?:\/|\\)(.*)\.([^\\/]+)$/)
	const filename = file_regex_match[1]

	// will store filename and template function
	let template

	// loads the template
	return fs.readFileAsync(template_path, 'utf8')
		.then((raw_template) => {

			// compiles a template
			template = enduro.templating_engine.compile(raw_template)

			// gets pagename
			const pagename = template_path.match(/([^\/\\]*)\.[^\.]*$/)[1]

			// If global data exists extends the context with it
			if (typeof enduro.cms_data !== 'undefined') {
				extend(true, context, enduro.cms_data)
			}

			// Add pagename to the context
			extend(true, context, {_meta: {pagename: pagename, culture: culture}})

			// adds in-cms networking
			globalizer.globalize(context)

			return markdownifier.markdownify(context)
		})
		.then(() => {
			// renders the template with the culturalized context
			let rendered_page = 'Error processing page'
			try {
				rendered_page = template(babel.culturalize(context, culture))
			} catch (e) {
				logger.err_block('Page: ' + filename + '\n' + e.message)
			}

			// outputs raw templates if render_templates setting is set to false. Defaults to true
			if (!enduro.config.render_templates) {
				rendered_page = raw_template
			}

			return rendered_page
		})
}

page_renderer.prototype.render_file_by_template_path_extend_context = function (context_path, extended_context) {
	const self = this
	extended_context = extended_context || {}

	const template_path = get_absolute_template_path_by_context_path(context_path)
	const culture = enduro.config.cultures[0]
	return flat.load(context_path)
		.then((context) => {
			extend(true, context, { _meta: { context_path: context_path } })
			extend(true, context, extended_context)
			return self.render_file_by_context(template_path, context, culture)
		})

}

page_renderer.prototype.render_file_by_template_path_replace_context = function (context_path, context, culture) {
	const self = this
	context = context || {}

	const template_path = get_absolute_template_path_by_context_path(context_path)
	culture = culture || enduro.config.cultures[0]

	return self.render_file_by_context(template_path, context, culture)
}

// transforms cms path related to /cms folder to template path related to the /pages folder
function get_absolute_template_path_by_context_path (context_path) {

	let template_path = context_path

	const splitted_filename = context_path.split('/')
	if (splitted_filename.indexOf('generators') + 1) {
		template_path = splitted_filename.slice(0, -1).join('/')
	}

	return path.join(enduro.project_path, 'pages', template_path + '.hbs')
}

module.exports = new page_renderer()
