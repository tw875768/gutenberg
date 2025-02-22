/**
 * External dependencies
 */
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import {
	useState,
	useEffect,
	useMemo,
	useRef,
	Platform,
} from '@wordpress/element';
import {
	__experimentalUseInnerBlocksProps as useInnerBlocksProps,
	InspectorControls,
	JustifyToolbar,
	BlockControls,
	useBlockProps,
	store as blockEditorStore,
	withColors,
	PanelColorSettings,
	ContrastChecker,
	getColorClassName,
} from '@wordpress/block-editor';
import { useDispatch, withSelect, withDispatch } from '@wordpress/data';
import { PanelBody, ToggleControl, ToolbarGroup } from '@wordpress/components';
import { compose } from '@wordpress/compose';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import useBlockNavigator from './use-block-navigator';
import NavigationPlaceholder from './placeholder';
import PlaceholderPreview from './placeholder-preview';
import ResponsiveWrapper from './responsive-wrapper';

const ALLOWED_BLOCKS = [
	'core/navigation-link',
	'core/search',
	'core/social-links',
	'core/page-list',
	'core/spacer',
	'core/home-link',
	'core/site-title',
	'core/site-logo',
	'core/navigation-submenu',
];

const DEFAULT_BLOCK = [ 'core/navigation-link' ];

const DIRECT_INSERT = ( block ) => {
	return block.innerBlocks.every(
		( { name } ) =>
			name === 'core/navigation-link' ||
			name === 'core/navigation-submenu'
	);
};

const LAYOUT = {
	type: 'default',
	alignments: [],
};

function getComputedStyle( node ) {
	return node.ownerDocument.defaultView.getComputedStyle( node );
}

function detectColors( colorsDetectionElement, setColor, setBackground ) {
	if ( ! colorsDetectionElement ) {
		return;
	}
	setColor( getComputedStyle( colorsDetectionElement ).color );

	let backgroundColorNode = colorsDetectionElement;
	let backgroundColor = getComputedStyle( backgroundColorNode )
		.backgroundColor;
	while (
		backgroundColor === 'rgba(0, 0, 0, 0)' &&
		backgroundColorNode.parentNode &&
		backgroundColorNode.parentNode.nodeType ===
			backgroundColorNode.parentNode.ELEMENT_NODE
	) {
		backgroundColorNode = backgroundColorNode.parentNode;
		backgroundColor = getComputedStyle( backgroundColorNode )
			.backgroundColor;
	}

	setBackground( backgroundColor );
}

function Navigation( {
	selectedBlockHasDescendants,
	attributes,
	setAttributes,
	clientId,
	hasExistingNavItems,
	isImmediateParentOfSelectedBlock,
	isSelected,
	updateInnerBlocks,
	className,
	backgroundColor,
	setBackgroundColor,
	textColor,
	setTextColor,
	overlayBackgroundColor,
	setOverlayBackgroundColor,
	overlayTextColor,
	setOverlayTextColor,

	// These props are used by the navigation editor to override specific
	// navigation block settings.
	hasSubmenuIndicatorSetting = true,
	hasItemJustificationControls = true,
	hasColorSettings = true,
	customPlaceholder: CustomPlaceholder = null,
	customAppender: CustomAppender = null,
} ) {
	const [ isPlaceholderShown, setIsPlaceholderShown ] = useState(
		! hasExistingNavItems
	);
	const [ isResponsiveMenuOpen, setResponsiveMenuVisibility ] = useState(
		false
	);

	const { selectBlock } = useDispatch( blockEditorStore );

	const navRef = useRef();

	const blockProps = useBlockProps( {
		ref: navRef,
		className: classnames( className, {
			[ `items-justified-${ attributes.itemsJustification }` ]: attributes.itemsJustification,
			'is-vertical': attributes.orientation === 'vertical',
			'is-responsive': attributes.isResponsive,
			'has-text-color': !! textColor.color || !! textColor?.class,
			[ getColorClassName(
				'color',
				textColor?.slug
			) ]: !! textColor?.slug,
			'has-background': !! backgroundColor.color || backgroundColor.class,
			[ getColorClassName(
				'background-color',
				backgroundColor?.slug
			) ]: !! backgroundColor?.slug,
		} ),
		style: {
			color: ! textColor?.slug && textColor?.color,
			backgroundColor: ! backgroundColor?.slug && backgroundColor?.color,
		},
	} );

	const { navigatorToolbarButton, navigatorModal } = useBlockNavigator(
		clientId
	);

	const placeholder = useMemo( () => <PlaceholderPreview />, [] );

	// When the block is selected itself or has a top level item selected that
	// doesn't itself have children, show the standard appender. Else show no
	// appender.
	const appender =
		isSelected ||
		( isImmediateParentOfSelectedBlock && ! selectedBlockHasDescendants )
			? undefined
			: false;

	const innerBlocksProps = useInnerBlocksProps(
		{
			className: 'wp-block-navigation__container',
		},
		{
			allowedBlocks: ALLOWED_BLOCKS,
			__experimentalDefaultBlock: DEFAULT_BLOCK,
			__experimentalDirectInsert: DIRECT_INSERT,
			orientation: attributes.orientation,
			renderAppender: CustomAppender || appender,

			// Ensure block toolbar is not too far removed from item
			// being edited when in vertical mode.
			// see: https://github.com/WordPress/gutenberg/pull/34615.
			__experimentalCaptureToolbars:
				attributes.orientation !== 'vertical',
			// Template lock set to false here so that the Nav
			// Block on the experimental menus screen does not
			// inherit templateLock={ 'all' }.
			templateLock: false,
			__experimentalLayout: LAYOUT,
			placeholder: ! CustomPlaceholder ? placeholder : undefined,
		}
	);

	// Turn on contrast checker for web only since it's not supported on mobile yet.
	const enableContrastChecking = Platform.OS === 'web';

	const [ detectedBackgroundColor, setDetectedBackgroundColor ] = useState();
	const [ detectedColor, setDetectedColor ] = useState();
	const [
		detectedOverlayBackgroundColor,
		setDetectedOverlayBackgroundColor,
	] = useState();
	const [ detectedOverlayColor, setDetectedOverlayColor ] = useState();

	useEffect( () => {
		if ( ! enableContrastChecking ) {
			return;
		}
		detectColors(
			navRef.current,
			setDetectedColor,
			setDetectedBackgroundColor
		);
		const subMenuElement = navRef.current.querySelector(
			'[data-type="core/navigation-link"] [data-type="core/navigation-link"]'
		);
		if ( subMenuElement ) {
			detectColors(
				subMenuElement,
				setDetectedOverlayColor,
				setDetectedOverlayBackgroundColor
			);
		}
	} );

	if ( isPlaceholderShown ) {
		const PlaceholderComponent = CustomPlaceholder
			? CustomPlaceholder
			: NavigationPlaceholder;

		return (
			<div { ...blockProps }>
				<PlaceholderComponent
					onCreate={ ( blocks, selectNavigationBlock ) => {
						setIsPlaceholderShown( false );
						updateInnerBlocks( blocks );
						if ( selectNavigationBlock ) {
							selectBlock( clientId );
						}
					} }
				/>
			</div>
		);
	}

	const justifyAllowedControls =
		attributes.orientation === 'vertical'
			? [ 'left', 'center', 'right' ]
			: [ 'left', 'center', 'right', 'space-between' ];

	return (
		<>
			<BlockControls>
				{ hasItemJustificationControls && (
					<JustifyToolbar
						value={ attributes.itemsJustification }
						allowedControls={ justifyAllowedControls }
						onChange={ ( value ) =>
							setAttributes( { itemsJustification: value } )
						}
						popoverProps={ {
							position: 'bottom right',
							isAlternate: true,
						} }
					/>
				) }
				<ToolbarGroup>{ navigatorToolbarButton }</ToolbarGroup>
			</BlockControls>
			{ navigatorModal }
			<InspectorControls>
				{ hasSubmenuIndicatorSetting && (
					<PanelBody title={ __( 'Display settings' ) }>
						<ToggleControl
							checked={ attributes.isResponsive }
							onChange={ ( value ) => {
								setAttributes( {
									isResponsive: value,
								} );
							} }
							label={ __( 'Enable responsive menu' ) }
						/>
						<ToggleControl
							checked={ attributes.openSubmenusOnClick }
							onChange={ ( value ) => {
								setAttributes( {
									openSubmenusOnClick: value,
								} );
							} }
							label={ __( 'Open submenus on click' ) }
						/>
						{ ! attributes.openSubmenusOnClick && (
							<ToggleControl
								checked={ attributes.showSubmenuIcon }
								onChange={ ( value ) => {
									setAttributes( {
										showSubmenuIcon: value,
									} );
								} }
								label={ __( 'Show submenu indicator icons' ) }
							/>
						) }
					</PanelBody>
				) }
				{ hasColorSettings && (
					<PanelColorSettings
						title={ __( 'Color' ) }
						initialOpen={ false }
						colorSettings={ [
							{
								value: textColor.color,
								onChange: setTextColor,
								label: __( 'Text' ),
							},
							{
								value: backgroundColor.color,
								onChange: setBackgroundColor,
								label: __( 'Background' ),
							},
							{
								value: overlayTextColor.color,
								onChange: setOverlayTextColor,
								label: __( 'Overlay text' ),
							},
							{
								value: overlayBackgroundColor.color,
								onChange: setOverlayBackgroundColor,
								label: __( 'Overlay background' ),
							},
						] }
					>
						{ enableContrastChecking && (
							<>
								<ContrastChecker
									backgroundColor={ detectedBackgroundColor }
									textColor={ detectedColor }
								/>
								<ContrastChecker
									backgroundColor={
										detectedOverlayBackgroundColor
									}
									textColor={ detectedOverlayColor }
								/>
							</>
						) }
					</PanelColorSettings>
				) }
			</InspectorControls>
			<nav { ...blockProps }>
				<ResponsiveWrapper
					id={ clientId }
					onToggle={ setResponsiveMenuVisibility }
					isOpen={ isResponsiveMenuOpen }
					isResponsive={ attributes.isResponsive }
				>
					<div { ...innerBlocksProps }></div>
				</ResponsiveWrapper>
			</nav>
		</>
	);
}

export default compose( [
	withSelect( ( select, { clientId } ) => {
		const innerBlocks = select( blockEditorStore ).getBlocks( clientId );
		const {
			getClientIdsOfDescendants,
			hasSelectedInnerBlock,
			getSelectedBlockClientId,
		} = select( blockEditorStore );
		const isImmediateParentOfSelectedBlock = hasSelectedInnerBlock(
			clientId,
			false
		);
		const selectedBlockId = getSelectedBlockClientId();
		const selectedBlockHasDescendants = !! getClientIdsOfDescendants( [
			selectedBlockId,
		] )?.length;

		return {
			isImmediateParentOfSelectedBlock,
			selectedBlockHasDescendants,
			hasExistingNavItems: !! innerBlocks.length,

			// This prop is already available but computing it here ensures it's
			// fresh compared to isImmediateParentOfSelectedBlock
			isSelected: selectedBlockId === clientId,
		};
	} ),
	withDispatch( ( dispatch, { clientId } ) => {
		return {
			updateInnerBlocks( blocks ) {
				if ( blocks?.length === 0 ) {
					return false;
				}
				dispatch( blockEditorStore ).replaceInnerBlocks(
					clientId,
					blocks,
					true
				);
			},
		};
	} ),
	withColors(
		{ textColor: 'color' },
		{ backgroundColor: 'color' },
		{ overlayBackgroundColor: 'color' },
		{ overlayTextColor: 'color' }
	),
] )( Navigation );
