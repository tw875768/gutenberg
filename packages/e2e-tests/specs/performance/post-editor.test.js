/**
 * External dependencies
 */
import { basename, join } from 'path';
import { writeFileSync } from 'fs';
import { sum } from 'lodash';

/**
 * WordPress dependencies
 */
import {
	createNewPost,
	saveDraft,
	openGlobalBlockInserter,
	closeGlobalBlockInserter,
} from '@wordpress/e2e-test-utils';

/**
 * Internal dependencies
 */
import {
	readFile,
	deleteFile,
	getTypingEventDurations,
	getClickEventDurations,
	getHoverEventDurations,
	getSelectionEventDurations,
} from './utils';

jest.setTimeout( 1000000 );

describe( 'Post Editor Performance', () => {
	const results = {
		load: [],
		type: [],
		focus: [],
		inserterOpen: [],
		inserterHover: [],
		inserterSearch: [],
	};
	const traceFile = __dirname + '/trace.json';
	let traceResults;

	beforeAll( async () => {
		const html = readFile(
			join( __dirname, '../../assets/large-post.html' )
		);

		await createNewPost();
		await page.evaluate( ( _html ) => {
			const { parse } = window.wp.blocks;
			const { dispatch } = window.wp.data;
			const blocks = parse( _html );

			blocks.forEach( ( block ) => {
				if ( block.name === 'core/image' ) {
					delete block.attributes.id;
					delete block.attributes.url;
				}
			} );

			dispatch( 'core/block-editor' ).resetBlocks( blocks );
		}, html );
		await saveDraft();
	} );

	afterAll( async () => {
		const resultsFilename = basename( __filename, '.js' ) + '.results.json';
		writeFileSync(
			join( __dirname, resultsFilename ),
			JSON.stringify( results, null, 2 )
		);
		deleteFile( traceFile );
	} );

	beforeEach( async () => {
		// Disable auto-save to avoid impacting the metrics.
		await page.evaluate( () => {
			window.wp.data
				.dispatch( 'core/edit-post' )
				.__experimentalUpdateLocalAutosaveInterval( 100000000000 );
			window.wp.data
				.dispatch( 'core/editor' )
				.updateEditorSettings( { autosaveInterval: 100000000000 } );
		} );
	} );

	it( 'Loading', async () => {
		// Measuring loading time
		let i = 5;
		while ( i-- ) {
			const startTime = new Date();
			await page.reload();
			await page.waitForSelector( '.wp-block' );
			results.load.push( new Date() - startTime );
		}
	} );

	it( 'Typing', async () => {
		// Measuring typing performance
		await page.click( '.edit-post-header-toolbar__list-view-toggle' );
		await page.click( '.edit-post-visual-editor__post-title-wrapper' );
		await page.keyboard.press( 'Enter' );
		let i = 20;
		await page.tracing.start( {
			path: traceFile,
			screenshots: false,
			categories: [ 'devtools.timeline' ],
		} );
		while ( i-- ) {
			// Wait for the browser to be idle before starting the monitoring.
			// The timeout should be big enough to allow all async tasks tor run.
			// And also to allow Rich Text to mark the change as persistent.
			// eslint-disable-next-line no-restricted-syntax
			await page.waitForTimeout( 2000 );
			await page.keyboard.type( 'x' );
		}
		await page.tracing.stop();
		traceResults = JSON.parse( readFile( traceFile ) );
		const [
			keyDownEvents,
			keyPressEvents,
			keyUpEvents,
		] = getTypingEventDurations( traceResults );
		if (
			keyDownEvents.length === keyPressEvents.length &&
			keyPressEvents.length === keyUpEvents.length
		) {
			// The first character typed triggers a longer time (isTyping change)
			// It can impact the stability of the metric, so we exclude it.
			for ( let j = 1; j < keyDownEvents.length; j++ ) {
				results.type.push(
					keyDownEvents[ j ] + keyPressEvents[ j ] + keyUpEvents[ j ]
				);
			}
		}
	} );

	it( 'Selecting blocks', async () => {
		// Measuring block selection performance
		await createNewPost();
		await page.click( '.edit-post-header-toolbar__list-view-toggle' );
		await page.evaluate( () => {
			const { createBlock } = window.wp.blocks;
			const { dispatch } = window.wp.data;
			const blocks = window.lodash
				.times( 1000 )
				.map( () => createBlock( 'core/paragraph' ) );
			dispatch( 'core/block-editor' ).resetBlocks( blocks );
		} );
		const paragraphs = await page.$$( '.wp-block' );
		await page.tracing.start( {
			path: traceFile,
			screenshots: false,
			categories: [ 'devtools.timeline' ],
		} );
		await paragraphs[ 0 ].click();
		for ( let j = 1; j <= 10; j++ ) {
			// Wait for the browser to be idle before starting the monitoring.
			// eslint-disable-next-line no-restricted-syntax
			await page.waitForTimeout( 1000 );
			await paragraphs[ j ].click();
		}
		await page.tracing.stop();
		traceResults = JSON.parse( readFile( traceFile ) );
		const [ focusEvents ] = getSelectionEventDurations( traceResults );
		results.focus = focusEvents;
	} );

	it( 'Opening the inserter', async () => {
		// Measure time to open inserter
		await page.waitForSelector( '.edit-post-layout' );
		for ( let j = 0; j < 10; j++ ) {
			await page.tracing.start( {
				path: traceFile,
				screenshots: false,
				categories: [ 'devtools.timeline' ],
			} );
			await openGlobalBlockInserter();
			await page.tracing.stop();
			traceResults = JSON.parse( readFile( traceFile ) );
			const [ mouseClickEvents ] = getClickEventDurations( traceResults );
			for ( let k = 0; k < mouseClickEvents.length; k++ ) {
				results.inserterOpen.push( mouseClickEvents[ k ] );
			}
			await closeGlobalBlockInserter();
		}
	} );

	it( 'Searching the inserter', async () => {
		// Measure time to search the inserter and get results
		await openGlobalBlockInserter();
		for ( let j = 0; j < 10; j++ ) {
			// Wait for the browser to be idle before starting the monitoring.
			// eslint-disable-next-line no-restricted-syntax
			await page.waitForTimeout( 500 );
			await page.tracing.start( {
				path: traceFile,
				screenshots: false,
				categories: [ 'devtools.timeline' ],
			} );
			await page.keyboard.type( 'p' );
			await page.tracing.stop();
			traceResults = JSON.parse( readFile( traceFile ) );
			const [
				keyDownEvents,
				keyPressEvents,
				keyUpEvents,
			] = getTypingEventDurations( traceResults );
			if (
				keyDownEvents.length === keyPressEvents.length &&
				keyPressEvents.length === keyUpEvents.length
			) {
				results.inserterSearch.push(
					sum( keyDownEvents ) +
						sum( keyPressEvents ) +
						sum( keyUpEvents )
				);
			}
			await page.keyboard.press( 'Backspace' );
		}
		await closeGlobalBlockInserter();
	} );

	it( 'Hovering Inserter Items', async () => {
		// Measure inserter hover performance
		const paragraphBlockItem =
			'.block-editor-inserter__menu .editor-block-list-item-paragraph';
		const headingBlockItem =
			'.block-editor-inserter__menu .editor-block-list-item-heading';
		await openGlobalBlockInserter();
		await page.waitForSelector( paragraphBlockItem );
		await page.hover( paragraphBlockItem );
		await page.hover( headingBlockItem );
		for ( let j = 0; j < 10; j++ ) {
			// Wait for the browser to be idle before starting the monitoring.
			// eslint-disable-next-line no-restricted-syntax
			await page.waitForTimeout( 200 );
			await page.tracing.start( {
				path: traceFile,
				screenshots: false,
				categories: [ 'devtools.timeline' ],
			} );
			await page.hover( paragraphBlockItem );
			await page.hover( headingBlockItem );
			await page.tracing.stop();

			traceResults = JSON.parse( readFile( traceFile ) );
			const [ mouseOverEvents, mouseOutEvents ] = getHoverEventDurations(
				traceResults
			);
			for ( let k = 0; k < mouseOverEvents.length; k++ ) {
				results.inserterHover.push(
					mouseOverEvents[ k ] + mouseOutEvents[ k ]
				);
			}
		}
		await closeGlobalBlockInserter();
	} );
} );
