/**
 * WordPress dependencies
 */
import { useState, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { withSpokenMessages, Popover } from '@wordpress/components';
import { prependHTTP } from '@wordpress/url';
import {
	create,
	insert,
	isCollapsed,
	applyFormat,
	useAnchorRef,
	removeFormat,
	slice,
	replace,
} from '@wordpress/rich-text';
import { __experimentalLinkControl as LinkControl } from '@wordpress/block-editor';
import { __unstableStripHTML as stripHTML } from '@wordpress/dom';

/**
 * Internal dependencies
 */
import { createLinkFormat, isValidHref } from './utils';
import { link as settings } from './index';
/**
 * External dependencies
 */
import { find } from 'lodash';

function getFormatBoundary(
	value,
	format,
	startIndex = value.start,
	endIndex = value.end
) {
	const { formats } = value;
	const newFormats = formats.slice();

	const startFormat = find( newFormats[ startIndex ], {
		type: format.type,
	} );

	if ( ! startFormat ) {
		return {
			start: null,
			end: null,
		};
	}

	const index = newFormats[ startIndex ].indexOf( startFormat );

	// Walk "backwards" until the start/leading "edge" of the matching format.
	while (
		newFormats[ startIndex ] &&
		newFormats[ startIndex ][ index ] === startFormat
	) {
		startIndex--;
	}

	endIndex++;

	// Walk "forwards" until the end/trailing "edge" of the matching format.
	while (
		newFormats[ endIndex ] &&
		newFormats[ endIndex ][ index ] === startFormat
	) {
		endIndex++;
	}

	// Return the indicies of the "edges" as the boundaries.
	return {
		start: startIndex + 1,
		end: endIndex,
	};
}

function InlineLinkUI( {
	isActive,
	activeAttributes,
	addingLink,
	value,
	onChange,
	speak,
	stopAddingLink,
	contentRef,
} ) {
	// Default to the selection ranges on the RichTextValue object.
	let textStart = value.start;
	let textEnd = value.end;

	// If there is no selection then manually find the boundary
	// of the selection via the active format.
	if ( isCollapsed( value ) ) {
		const boundary = getFormatBoundary( value, {
			type: 'core/link',
		} );

		textStart = boundary.start;
		textEnd = boundary.end;
	}

	// Get a RichTextValue containing the selected text content.
	const richLinkTextValue = slice( value, textStart, textEnd );

	// Get the text content minus any HTML tags.
	const text = stripHTML( richLinkTextValue.text );

	/**
	 * Pending settings to be applied to the next link. When inserting a new
	 * link, toggle values cannot be applied immediately, because there is not
	 * yet a link for them to apply to. Thus, they are maintained in a state
	 * value until the time that the link can be inserted or edited.
	 *
	 * @type {[Object|undefined,Function]}
	 */
	const [ nextLinkValue, setNextLinkValue ] = useState();

	const linkValue = {
		url: activeAttributes.url,
		type: activeAttributes.type,
		id: activeAttributes.id,
		opensInNewTab: activeAttributes.target === '_blank',
		text,
		...nextLinkValue,
	};

	function removeLink() {
		const newValue = removeFormat( value, 'core/link' );
		onChange( newValue );
		stopAddingLink();
		speak( __( 'Link removed.' ), 'assertive' );
	}

	function onChangeLink( nextValue ) {
		// Merge with values from state, both for the purpose of assigning the
		// next state value, and for use in constructing the new link format if
		// the link is ready to be applied.
		nextValue = {
			...nextLinkValue,
			...nextValue,
		};

		// LinkControl calls `onChange` immediately upon the toggling a setting.
		const didToggleSetting =
			linkValue.opensInNewTab !== nextValue.opensInNewTab &&
			linkValue.url === nextValue.url;

		// If change handler was called as a result of a settings change during
		// link insertion, it must be held in state until the link is ready to
		// be applied.
		const didToggleSettingForNewLink =
			didToggleSetting && nextValue.url === undefined;

		// If link will be assigned, the state value can be considered flushed.
		// Otherwise, persist the pending changes.
		setNextLinkValue( didToggleSettingForNewLink ? nextValue : undefined );

		if ( didToggleSettingForNewLink ) {
			return;
		}

		const newUrl = prependHTTP( nextValue.url );
		const linkFormat = createLinkFormat( {
			url: newUrl,
			type: nextValue.type,
			id:
				nextValue.id !== undefined && nextValue.id !== null
					? String( nextValue.id )
					: undefined,
			opensInNewWindow: nextValue.opensInNewTab,
		} );

		const newText = nextValue?.text || nextValue.title || newUrl;

		if ( isCollapsed( value ) && ! isActive ) {
			// Scenario: we don't have any actively selected text or formats.
			const toInsert = applyFormat(
				create( { text: newText } ),
				linkFormat,
				0,
				newText.length
			);
			onChange( insert( value, toInsert ) );
		} else {
			// Scenario: we have any active text selection or an active format

			// Update the **text** (only) with the new text from the Link UI.
			// This action retains any formats that were currently applied to
			// the text selection (eg: bold, italic...etc).
			let newValue = replace( richLinkTextValue, text, newText );

			// Apply the new Link format to this new value.
			newValue = applyFormat( newValue, linkFormat, 0, newText.length );

			// Update the full existing value replacing the
			// target text with the new RichTextValue containing:
			// 1. The new text content.
			// 2. The new link format.
			// 3. Any original formats.
			newValue = replace( value, text, newValue );

			newValue.start = newValue.end;
			newValue.activeFormats = [];
			onChange( newValue );
		}

		// Focus should only be shifted back to the formatted segment when the
		// URL is submitted.
		if ( ! didToggleSetting ) {
			stopAddingLink();
		}

		if ( ! isValidHref( newUrl ) ) {
			speak(
				__(
					'Warning: the link has been inserted but may have errors. Please test it.'
				),
				'assertive'
			);
		} else if ( isActive ) {
			speak( __( 'Link edited.' ), 'assertive' );
		} else {
			speak( __( 'Link inserted.' ), 'assertive' );
		}
	}

	const anchorRef = useAnchorRef( { ref: contentRef, value, settings } );

	// The focusOnMount prop shouldn't evolve during render of a Popover
	// otherwise it causes a render of the content.
	const focusOnMount = useRef( addingLink ? 'firstElement' : false );

	return (
		<Popover
			anchorRef={ anchorRef }
			focusOnMount={ focusOnMount.current }
			onClose={ stopAddingLink }
			position="bottom center"
		>
			<LinkControl
				value={ linkValue }
				onChange={ onChangeLink }
				onRemove={ removeLink }
				forceIsEditingLink={ addingLink }
				hasRichPreviews
				hasTextControl
			/>
		</Popover>
	);
}

export default withSpokenMessages( InlineLinkUI );
