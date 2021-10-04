/**
 * External dependencies
 */
import { noop } from 'lodash';
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import { Button, Spinner, Notice, TextControl } from '@wordpress/components';
import { keyboardReturn } from '@wordpress/icons';
import { __ } from '@wordpress/i18n';
import { useRef, useState, useEffect } from '@wordpress/element';
import { focus } from '@wordpress/dom';
import { ENTER } from '@wordpress/keycodes';

/**
 * Internal dependencies
 */
import LinkControlSettingsDrawer from './settings-drawer';
import LinkControlSearchInput from './search-input';
import LinkPreview from './link-preview';
import useCreatePage from './use-create-page';
import { ViewerFill } from './viewer-slot';
import { DEFAULT_LINK_SETTINGS } from './constants';

/**
 * Default properties associated with a link control value.
 *
 * @typedef WPLinkControlDefaultValue
 *
 * @property {string}   url           Link URL.
 * @property {string=}  title         Link title.
 * @property {boolean=} opensInNewTab Whether link should open in a new browser
 *                                    tab. This value is only assigned if not
 *                                    providing a custom `settings` prop.
 */

/* eslint-disable jsdoc/valid-types */
/**
 * Custom settings values associated with a link.
 *
 * @typedef {{[setting:string]:any}} WPLinkControlSettingsValue
 */
/* eslint-enable */

/**
 * Custom settings values associated with a link.
 *
 * @typedef WPLinkControlSetting
 *
 * @property {string} id    Identifier to use as property for setting value.
 * @property {string} title Human-readable label to show in user interface.
 */

/**
 * Properties associated with a link control value, composed as a union of the
 * default properties and any custom settings values.
 *
 * @typedef {WPLinkControlDefaultValue&WPLinkControlSettingsValue} WPLinkControlValue
 */

/** @typedef {(nextValue:WPLinkControlValue)=>void} WPLinkControlOnChangeProp */

/**
 * Properties associated with a search suggestion used within the LinkControl.
 *
 * @typedef WPLinkControlSuggestion
 *
 * @property {string} id    Identifier to use to uniquely identify the suggestion.
 * @property {string} type  Identifies the type of the suggestion (eg: `post`,
 *                          `page`, `url`...etc)
 * @property {string} title Human-readable label to show in user interface.
 * @property {string} url   A URL for the suggestion.
 */

/** @typedef {(title:string)=>WPLinkControlSuggestion} WPLinkControlCreateSuggestionProp */

/**
 * @typedef WPLinkControlProps
 *
 * @property {(WPLinkControlSetting[])=}  settings                   An array of settings objects. Each object will used to
 *                                                                   render a `ToggleControl` for that setting.
 * @property {boolean=}                   forceIsEditingLink         If passed as either `true` or `false`, controls the
 *                                                                   internal editing state of the component to respective
 *                                                                   show or not show the URL input field.
 * @property {WPLinkControlValue=}        value                      Current link value.
 * @property {WPLinkControlOnChangeProp=} onChange                   Value change handler, called with the updated value if
 *                                                                   the user selects a new link or updates settings.
 * @property {boolean=}                   noDirectEntry              Whether to allow turning a URL-like search query directly into a link.
 * @property {boolean=}                   showSuggestions            Whether to present suggestions when typing the URL.
 * @property {boolean=}                   showInitialSuggestions     Whether to present initial suggestions immediately.
 * @property {boolean=}                   withCreateSuggestion       Whether to allow creation of link value from suggestion.
 * @property {Object=}                    suggestionsQuery           Query parameters to pass along to wp.blockEditor.__experimentalFetchLinkSuggestions.
 * @property {boolean=}                   noURLSuggestion            Whether to add a fallback suggestion which treats the search query as a URL.
 * @property {string|Function|undefined}  createSuggestionButtonText The text to use in the button that calls createSuggestion.
 */

/**
 * Renders a link control. A link control is a controlled input which maintains
 * a value associated with a link (HTML anchor element) and relevant settings
 * for how that link is expected to behave.
 *
 * @param {WPLinkControlProps} props Component props.
 */
function LinkControl( {
	searchInputPlaceholder,
	value,
	settings = DEFAULT_LINK_SETTINGS,
	onChange = noop,
	onRemove,
	noDirectEntry = false,
	showSuggestions = true,
	showInitialSuggestions,
	forceIsEditingLink,
	createSuggestion,
	withCreateSuggestion,
	inputValue: propInputValue = '',
	suggestionsQuery = {},
	noURLSuggestion = false,
	createSuggestionButtonText,
	hasRichPreviews = false,
	hasTextControl = false,
} ) {
	if ( withCreateSuggestion === undefined && createSuggestion ) {
		withCreateSuggestion = true;
	}

	const isMounting = useRef( true );
	const wrapperNode = useRef();

	const [ internalInputValue, setInternalInputValue ] = useState(
		value?.url || ''
	);
	const [ internalTextValue, setInternalTextValue ] = useState(
		value?.text || ''
	);
	const currentInputValue = propInputValue || internalInputValue;
	const [ isEditingLink, setIsEditingLink ] = useState(
		forceIsEditingLink !== undefined
			? forceIsEditingLink
			: ! value || ! value.url
	);
	const isEndingEditWithFocus = useRef( false );

	useEffect( () => {
		if (
			forceIsEditingLink !== undefined &&
			forceIsEditingLink !== isEditingLink
		) {
			setIsEditingLink( forceIsEditingLink );
		}
	}, [ forceIsEditingLink ] );

	useEffect( () => {
		if ( isMounting.current ) {
			isMounting.current = false;
			return;
		}

		const linkURLInputIndex = 1;

		// When editing, the 2nd focusable element is the Link URL input.
		const whichFocusTarget = isEditingLink ? linkURLInputIndex : 0;
		// When switching between editable and non editable LinkControl
		// move focus to the most appropriate element to avoid focus loss.
		const nextFocusTarget =
			focus.focusable.find( wrapperNode.current )[ whichFocusTarget ] ||
			wrapperNode.current;

		nextFocusTarget.focus();

		isEndingEditWithFocus.current = false;
	}, [ isEditingLink ] );

	/**
	 * If the value's `text` property changes then sync this
	 * back up with state.
	 */
	useEffect( () => {
		if ( value?.text && value.text !== internalTextValue ) {
			setInternalTextValue( value.text );
		}
	}, [ value ] );

	/**
	 * Cancels editing state and marks that focus may need to be restored after
	 * the next render, if focus was within the wrapper when editing finished.
	 */
	function stopEditing() {
		isEndingEditWithFocus.current = !! wrapperNode.current?.contains(
			wrapperNode.current.ownerDocument.activeElement
		);

		setIsEditingLink( false );
	}

	const { createPage, isCreatingPage, errorMessage } = useCreatePage(
		createSuggestion
	);

	const handleSelectSuggestion = ( updatedValue ) => {
		onChange( {
			...updatedValue,
			text: internalTextValue,
		} );
		stopEditing();
	};

	const handleSubmitButton = () => {
		if (
			currentInputValue !== value?.url ||
			internalTextValue !== value?.text
		) {
			onChange( {
				url: currentInputValue,
				text: internalTextValue,
			} );
		}
		stopEditing();
	};

	const shownUnlinkControl =
		onRemove && value && ! isEditingLink && ! isCreatingPage;

	const showSettingsDrawer = !! settings?.length;

	// Only show text control once a URL value has been committed.
	// See https://github.com/WordPress/gutenberg/pull/33849/#issuecomment-932194927.
	const showTextControl = value?.url && hasTextControl;

	return (
		<div
			tabIndex={ -1 }
			ref={ wrapperNode }
			className="block-editor-link-control"
		>
			{ isCreatingPage && (
				<div className="block-editor-link-control__loading">
					<Spinner /> { __( 'Creating' ) }…
				</div>
			) }

			{ ( isEditingLink || ! value ) && ! isCreatingPage && (
				<>
					<div
						className={ classnames( {
							'block-editor-link-control__search-input-wrapper': true,
							'has-text-control': showTextControl,
						} ) }
					>
						{ showTextControl && (
							<TextControl
								className="block-editor-link-control__field block-editor-link-control__text-content"
								label="Text"
								value={ internalTextValue }
								onChange={ setInternalTextValue }
							/>
						) }

						<LinkControlSearchInput
							currentLink={ value }
							className="block-editor-link-control__field block-editor-link-control__search-input"
							placeholder={ searchInputPlaceholder }
							value={ currentInputValue }
							withCreateSuggestion={ withCreateSuggestion }
							onCreateSuggestion={ createPage }
							onChange={ setInternalInputValue }
							onSelect={ handleSelectSuggestion }
							showInitialSuggestions={ showInitialSuggestions }
							allowDirectEntry={ ! noDirectEntry }
							showSuggestions={ showSuggestions }
							suggestionsQuery={ suggestionsQuery }
							withURLSuggestion={ ! noURLSuggestion }
							createSuggestionButtonText={
								createSuggestionButtonText
							}
						>
							<div className="block-editor-link-control__search-actions">
								<Button
									onClick={ () => handleSubmitButton() }
									onKeyDown={ ( event ) => {
										const { keyCode } = event;
										if ( keyCode === ENTER ) {
											event.preventDefault();
											handleSubmitButton();
										}
									} }
									label={ __( 'Submit' ) }
									icon={ keyboardReturn }
									className="block-editor-link-control__search-submit"
								/>
							</div>
						</LinkControlSearchInput>
					</div>
					{ errorMessage && (
						<Notice
							className="block-editor-link-control__search-error"
							status="error"
							isDismissible={ false }
						>
							{ errorMessage }
						</Notice>
					) }
				</>
			) }

			{ value && ! isEditingLink && ! isCreatingPage && (
				<LinkPreview
					key={ value?.url } // force remount when URL changes to avoid race conditions for rich previews
					value={ value }
					onEditClick={ () => setIsEditingLink( true ) }
					hasRichPreviews={ hasRichPreviews }
				/>
			) }

			{ ( showSettingsDrawer || shownUnlinkControl ) && (
				<div className="block-editor-link-control__tools">
					<LinkControlSettingsDrawer
						value={ value }
						settings={ settings }
						onChange={ onChange }
					/>
					{ shownUnlinkControl && (
						<Button
							className="block-editor-link-control__unlink"
							isDestructive
							variant="link"
							onClick={ onRemove }
						>
							{ __( 'Unlink' ) }
						</Button>
					) }
				</div>
			) }
		</div>
	);
}

LinkControl.ViewerFill = ViewerFill;

export default LinkControl;
